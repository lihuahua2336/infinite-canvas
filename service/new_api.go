package service

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type NewAPIConfig struct {
	Configured   bool               `json:"configured"`
	DisplayName string             `json:"displayName"`
	LoginURL    string             `json:"loginUrl"`
	Message     string             `json:"message"`
	Models      []string           `json:"models"`
	Tokens      []NewAPITokenBrief `json:"tokens"`
}

type NewAPITokenBrief struct {
	TokenID   int    `json:"tokenId"`
	TokenName string `json:"tokenName"`
	BaseURL   string `json:"baseUrl"`
	APIKey    string `json:"apiKey"`
	Group     string `json:"group"`
}

type newAPIEcosystemToken struct {
	TokenID   int    `json:"token_id"`
	TokenName string `json:"token_name"`
	APIKey    string `json:"api_key"`
	BaseURL   string `json:"base_url"`
	Group     string `json:"group"`
}

var newAPIHTTPClient = &http.Client{Timeout: 20 * time.Second}

func UserNewAPIConfig(userID string) (NewAPIConfig, error) {
	displayName := NewAPIDisplayName()
	result := NewAPIConfig{DisplayName: displayName, LoginURL: NewAPISetupURL(), Models: []string{}, Tokens: []NewAPITokenBrief{}}
	if strings.TrimSpace(config.Cfg.NewAPIBaseURL) == "" {
		result.Message = displayName + " 地址未配置，请在 .env 中设置 NEW_API_BASE_URL"
		return result, nil
	}
	accessToken, ok, err := userNewAPIAccessToken(userID)
	if err != nil {
		return result, err
	}
	if !ok {
		result.Message = "请使用 Logto 重新登录本服务，然后前往 " + displayName + " 登录 Logto 并创建令牌"
		return result, nil
	}
	if err := newAPIGet(accessToken, "/api/ecosystem/me", nil); err != nil {
		result.Message = "无法确认 " + displayName + " 账户，请前往 " + displayName + " 使用 Logto 登录并完成配置"
		return result, nil
	}
	models, err := fetchNewAPIModels(accessToken)
	if err != nil {
		result.Message = err.Error()
		return result, nil
	}
	tokens, err := fetchNewAPITokens(accessToken)
	if err != nil {
		result.Message = err.Error()
		return result, nil
	}
	result.Models = models
	result.Tokens = publicNewAPITokens(tokens)
	result.Configured = len(result.Models) > 0 && len(result.Tokens) > 0
	if len(result.Models) == 0 {
		result.Message = displayName + " 当前没有可用模型，请先在 " + displayName + " 后台配置模型渠道"
	} else if len(result.Tokens) == 0 {
		result.Message = displayName + " 当前没有可用令牌，请前往 " + displayName + " 登录后创建令牌"
	} else {
		result.Message = displayName + " 已连接"
	}
	return result, nil
}

func NewAPIModelChannel(userID string, modelName string) (model.ModelChannel, error) {
	displayName := NewAPIDisplayName()
	if strings.TrimSpace(config.Cfg.NewAPIBaseURL) == "" {
		return model.ModelChannel{}, safeMessageError{message: displayName + " 地址未配置，请在 .env 中设置 NEW_API_BASE_URL"}
	}
	accessToken, ok, err := userNewAPIAccessToken(userID)
	if err != nil {
		return model.ModelChannel{}, err
	}
	if !ok {
		return model.ModelChannel{}, safeMessageError{message: "请使用 Logto 重新登录本服务，然后前往 " + displayName + " 登录 Logto 并创建令牌"}
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = "gpt-image-2"
	}
	models, err := fetchNewAPIModels(accessToken)
	if err != nil {
		return model.ModelChannel{}, err
	}
	if len(models) > 0 && !stringInSlice(modelName, models) {
		return model.ModelChannel{}, safeMessageError{message: displayName + " 当前用户不可用该模型，请刷新云端渠道模型列表"}
	}
	tokens, err := fetchNewAPITokens(accessToken)
	if err != nil {
		return model.ModelChannel{}, err
	}
	token, ok := firstUsableNewAPIToken(tokens)
	if !ok {
		return model.ModelChannel{}, safeMessageError{message: displayName + " 当前没有可用令牌，请前往 " + displayName + " 创建令牌"}
	}
	return model.ModelChannel{
		Protocol: "openai",
		Name:     displayName,
		BaseURL:  strings.TrimSpace(config.Cfg.NewAPIBaseURL),
		APIKey:   token.APIKey,
		Models:   []string{modelName},
		Weight:   1,
		Enabled:  true,
	}, nil
}

func NewAPIDisplayName() string {
	name := strings.TrimSpace(config.Cfg.NewAPIDisplayName)
	if name == "" {
		return "New API"
	}
	return name
}

func NewAPISetupURL() string {
	baseURL := firstNonEmpty(config.Cfg.NewAPIPublicURL, config.Cfg.NewAPIBaseURL)
	if strings.TrimSpace(baseURL) == "" {
		return ""
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return baseURL
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/keys"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func userNewAPIAccessToken(userID string) (string, bool, error) {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		return "", false, err
	}
	token, ok := newAPITokenFromUser(user)
	if !ok {
		return "", false, nil
	}
	if fresh, refreshed, ok, err := refreshNewAPIAccessToken(user, token); err != nil || !ok {
		return "", false, err
	} else if refreshed {
		return fresh.AccessToken, true, nil
	}
	return token.AccessToken, true, nil
}

func refreshNewAPIAccessToken(user model.User, token newAPITokenInfo) (newAPITokenInfo, bool, bool, error) {
	if token.Expiry == "" {
		return token, false, true, nil
	}
	expiry, err := time.Parse(time.RFC3339, token.Expiry)
	if err != nil || time.Now().Before(expiry.Add(-time.Minute)) {
		return token, false, true, nil
	}
	if strings.TrimSpace(token.RefreshToken) == "" {
		return token, false, false, nil
	}
	settings, err := repository.GetSettings()
	if err != nil {
		return token, false, false, err
	}
	settings = normalizeSettings(settings)
	oidcSetting := settings.Private.Auth.OIDC
	if !settings.Public.Auth.OIDC.Enabled || oidcSetting.Issuer == "" || oidcSetting.ClientID == "" || oidcSetting.ClientSecret == "" {
		return token, false, false, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if client := oidcInternalHTTPClient(oidcSetting); client != nil {
		ctx = oidc.ClientContext(ctx, client)
		ctx = context.WithValue(ctx, oauth2.HTTPClient, client)
	}
	provider, err := oidc.NewProvider(ctx, oidcSetting.Issuer)
	if err != nil {
		return token, false, false, err
	}
	source := oidcOAuthConfigFromEndpoint(provider.Endpoint(), oidcSetting, "").TokenSource(ctx, &oauth2.Token{
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
		TokenType:    token.TokenType,
		Expiry:       expiry,
	})
	nextToken, err := source.Token()
	if err != nil {
		return token, false, false, nil
	}
	next := newAPITokenFromOAuth(nextToken)
	if next == nil {
		return token, false, false, nil
	}
	if next.RefreshToken == "" {
		next.RefreshToken = token.RefreshToken
	}
	if err := saveUserNewAPIToken(user, *next); err != nil {
		return token, false, false, err
	}
	return *next, true, true, nil
}

func saveUserNewAPIToken(user model.User, token newAPITokenInfo) error {
	extra := readUserExtra(user.Extra)
	extra.NewAPI = &token
	user.Extra = marshalUserExtra(extra)
	user.UpdatedAt = now()
	_, err := repository.SaveUser(user)
	return err
}

func fetchNewAPIModels(accessToken string) ([]string, error) {
	var models []string
	if err := newAPIGet(accessToken, "/api/ecosystem/models", &models); err != nil {
		return nil, err
	}
	return uniqueSortedStrings(models), nil
}

func fetchNewAPITokens(accessToken string) ([]newAPIEcosystemToken, error) {
	var tokens []newAPIEcosystemToken
	if err := newAPIGet(accessToken, "/api/ecosystem/tokens", &tokens); err != nil {
		return nil, err
	}
	return tokens, nil
}

func newAPIGet(accessToken string, path string, target any) error {
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(config.Cfg.NewAPIBaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response, err := newAPIHTTPClient.Do(request)
	if err != nil {
		return safeMessageError{message: NewAPIDisplayName() + " 连接失败，请检查 NEW_API_BASE_URL"}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= http.StatusBadRequest {
		return safeMessageError{message: NewAPIDisplayName() + " 请求失败：" + http.StatusText(response.StatusCode)}
	}
	payload := struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}{}
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&payload); err != nil {
		return safeMessageError{message: NewAPIDisplayName() + " 返回异常"}
	}
	if !payload.Success {
		message := strings.TrimSpace(payload.Message)
		if message == "" {
			message = NewAPIDisplayName() + " 请求失败"
		}
		return safeMessageError{message: message}
	}
	if target == nil {
		return nil
	}
	if err := json.Unmarshal(payload.Data, target); err != nil {
		return safeMessageError{message: NewAPIDisplayName() + " 返回数据格式异常"}
	}
	return nil
}

func publicNewAPITokens(tokens []newAPIEcosystemToken) []NewAPITokenBrief {
	result := make([]NewAPITokenBrief, 0, len(tokens))
	for _, token := range tokens {
		if strings.TrimSpace(token.APIKey) == "" {
			continue
		}
		baseURL := firstNonEmpty(token.BaseURL, config.Cfg.NewAPIPublicURL, config.Cfg.NewAPIBaseURL)
		result = append(result, NewAPITokenBrief{
			TokenID:   token.TokenID,
			TokenName: token.TokenName,
			BaseURL:   baseURL,
			APIKey:    token.APIKey,
			Group:     token.Group,
		})
	}
	return result
}

func firstUsableNewAPIToken(tokens []newAPIEcosystemToken) (newAPIEcosystemToken, bool) {
	for _, token := range tokens {
		if strings.TrimSpace(token.APIKey) != "" {
			return token, true
		}
	}
	return newAPIEcosystemToken{}, false
}

func uniqueSortedStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
