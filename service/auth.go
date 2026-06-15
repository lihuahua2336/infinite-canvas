package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
)

type TokenClaims struct {
	UserID   string         `json:"userId"`
	Username string         `json:"username"`
	Role     model.UserRole `json:"role"`
	jwt.RegisteredClaims
}

type userExtra struct {
	LinuxDo any `json:"linuxDo,omitempty"`
	OIDC    any `json:"oidc,omitempty"`
}

func EnsureDefaultAdmin() error {
	if strings.TrimSpace(config.Cfg.AdminUsername) == "" || strings.TrimSpace(config.Cfg.AdminPassword) == "" {
		return nil
	}
	WarnDefaultSecurityConfig()
	hasAdmin, err := repository.HasAdmin()
	if err != nil || hasAdmin {
		return err
	}
	hash, err := hashPassword(config.Cfg.AdminPassword)
	if err != nil {
		return err
	}
	_, err = repository.SaveUser(model.User{
		ID:        newID("user"),
		Username:  strings.TrimSpace(config.Cfg.AdminUsername),
		Password:  hash,
		Role:      model.UserRoleAdmin,
		AffCode:   newAffCode(),
		Status:    model.UserStatusActive,
		CreatedAt: now(),
		UpdatedAt: now(),
	})
	return err
}

func Register(username string, password string) (model.AuthSession, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.AuthSession{}, err
	}
	normalizedSettings := normalizeSettings(settings)
	if normalizedSettings.Public.Auth.AllowRegister != nil && !*normalizedSettings.Public.Auth.AllowRegister {
		return model.AuthSession{}, safeMessageError{message: "当前未开放注册"}
	}
	username = strings.TrimSpace(username)
	if strings.ContainsAny(username, " \t\r\n") {
		return model.AuthSession{}, safeMessageError{message: "用户名不能包含空格"}
	}
	if username == "" || password == "" {
		return model.AuthSession{}, safeMessageError{message: "用户名和密码不能为空"}
	}
	if _, ok, err := repository.GetUserByUsername(username); err != nil || ok {
		if err != nil {
			return model.AuthSession{}, err
		}
		return model.AuthSession{}, safeMessageError{message: "用户名已存在"}
	}
	hash, err := hashPassword(password)
	if err != nil {
		return model.AuthSession{}, err
	}
	user, err := repository.SaveUser(model.User{
		ID:        newID("user"),
		Username:  username,
		Password:  hash,
		Role:      model.UserRoleUser,
		AffCode:   newAffCode(),
		Status:    model.UserStatusActive,
		CreatedAt: now(),
		UpdatedAt: now(),
	})
	if err != nil {
		return model.AuthSession{}, err
	}
	return newSession(user)
}

func Login(username string, password string) (model.AuthSession, error) {
	user, ok, err := repository.GetUserByUsername(strings.TrimSpace(username))
	if err != nil {
		return model.AuthSession{}, err
	}
	if !ok || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		return model.AuthSession{}, safeMessageError{message: "用户名或密码错误"}
	}
	if user.Status == model.UserStatusBan {
		return model.AuthSession{}, safeMessageError{message: "账号已被禁用"}
	}
	normalizeUserDefaults(&user)
	user.LastLoginAt = now()
	user.UpdatedAt = now()
	user, err = repository.SaveUser(user)
	if err != nil {
		return model.AuthSession{}, err
	}
	return newSession(user)
}

func LinuxDoAuthorizeURL(r *http.Request, redirect string) (string, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return "", err
	}
	settings = normalizeSettings(settings)
	linuxDo := settings.Private.Auth.LinuxDo
	if !settings.Public.Auth.LinuxDo.Enabled {
		return "", safeMessageError{message: "Linux.do 登录未开启"}
	}
	if strings.TrimSpace(linuxDo.ClientID) == "" || strings.TrimSpace(linuxDo.ClientSecret) == "" {
		return "", safeMessageError{message: "Linux.do 登录未配置"}
	}
	values := url.Values{}
	values.Set("client_id", linuxDo.ClientID)
	values.Set("redirect_uri", linuxDoRedirectURI(r))
	values.Set("response_type", "code")
	values.Set("scope", "read")
	values.Set("state", base64.RawURLEncoding.EncodeToString([]byte(redirect)))
	return config.Cfg.LinuxDoAuthorizeURL + "?" + values.Encode(), nil
}

func LoginWithLinuxDo(r *http.Request, code string, state string) (model.AuthSession, string, error) {
	redirect := decodeState(state)
	settings, err := repository.GetSettings()
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	settings = normalizeSettings(settings)
	linuxDo := settings.Private.Auth.LinuxDo
	if !settings.Public.Auth.LinuxDo.Enabled {
		return model.AuthSession{}, redirect, safeMessageError{message: "Linux.do 登录未开启"}
	}
	token, err := linuxDoAccessToken(r, code, linuxDo)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	profile, err := linuxDoProfile(token)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	linuxDoID := fmt.Sprint(profile.ID)
	if strings.TrimSpace(linuxDoID) == "" || linuxDoID == "0" {
		return model.AuthSession{}, redirect, safeMessageError{message: "Linux.do 用户信息无效"}
	}
	user, ok, err := repository.GetUserByLinuxDoID(linuxDoID)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	if !ok {
		if settings.Public.Auth.AllowRegister != nil && !*settings.Public.Auth.AllowRegister {
			return model.AuthSession{}, redirect, safeMessageError{message: "当前未开放注册"}
		}
		user = model.User{
			ID:          newID("user"),
			Username:    linuxDoUsername(profile.Username, linuxDoID),
			DisplayName: strings.TrimSpace(profile.Name),
			AvatarURL:   linuxDoAvatar(profile.AvatarTemplate),
			Role:        model.UserRoleUser,
			AffCode:     newAffCode(),
			LinuxDoID:   linuxDoID,
			Status:      model.UserStatusActive,
			CreatedAt:   now(),
		}
	} else if user.Status == model.UserStatusBan {
		return model.AuthSession{}, redirect, safeMessageError{message: "账号已被禁用"}
	}
	user.DisplayName = firstNonEmpty(profile.Name, user.DisplayName)
	user.AvatarURL = firstNonEmpty(linuxDoAvatar(profile.AvatarTemplate), user.AvatarURL)
	user.LastLoginAt = now()
	user.UpdatedAt = now()
	extra, _ := json.Marshal(userExtra{LinuxDo: profile})
	user.Extra = string(extra)
	user, err = repository.SaveUser(user)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	session, err := newSession(user)
	return session, redirect, err
}

func OIDCAuthorizeURL(r *http.Request, redirect string) (string, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return "", err
	}
	settings = normalizeSettings(settings)
	oidcSetting := settings.Private.Auth.OIDC
	if !settings.Public.Auth.OIDC.Enabled {
		return "", safeMessageError{message: oidcDisplayName(settings.Public.Auth.OIDC.Name) + " 登录未开启"}
	}
	if oidcSetting.Issuer == "" || oidcSetting.ClientID == "" || oidcSetting.ClientSecret == "" {
		return "", safeMessageError{message: oidcDisplayName(settings.Public.Auth.OIDC.Name) + " 登录未配置"}
	}
	ctx, cancel := oidcRequestContext(r, oidcSetting)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, oidcSetting.Issuer)
	if err != nil {
		return "", safeMessageError{message: "OIDC Issuer 发现失败"}
	}
	config := oidcOAuthConfig(r, provider, oidcSetting)
	return config.AuthCodeURL(base64.RawURLEncoding.EncodeToString([]byte(redirect))), nil
}

func LoginWithOIDC(r *http.Request, code string, state string) (model.AuthSession, string, error) {
	redirect := decodeState(state)
	settings, err := repository.GetSettings()
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	settings = normalizeSettings(settings)
	oidcSetting := settings.Private.Auth.OIDC
	if !settings.Public.Auth.OIDC.Enabled {
		return model.AuthSession{}, redirect, safeMessageError{message: oidcDisplayName(settings.Public.Auth.OIDC.Name) + " 登录未开启"}
	}
	if oidcSetting.Issuer == "" || oidcSetting.ClientID == "" || oidcSetting.ClientSecret == "" {
		return model.AuthSession{}, redirect, safeMessageError{message: oidcDisplayName(settings.Public.Auth.OIDC.Name) + " 登录未配置"}
	}
	ctx, cancel := oidcRequestContext(r, oidcSetting)
	defer cancel()
	provider, err := oidc.NewProvider(ctx, oidcSetting.Issuer)
	if err != nil {
		return model.AuthSession{}, redirect, safeMessageError{message: "OIDC Issuer 发现失败"}
	}
	token, err := oidcOAuthConfig(r, provider, oidcSetting).Exchange(ctx, code)
	if err != nil {
		return model.AuthSession{}, redirect, safeMessageError{message: "OIDC 登录失败"}
	}
	profile, err := oidcProfile(ctx, provider, token, oidcSetting)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	subject := strings.TrimSpace(profile.Sub)
	if subject == "" {
		return model.AuthSession{}, redirect, safeMessageError{message: "OIDC 用户信息无效"}
	}
	user, ok, err := repository.GetUserByOIDCSubject(oidcSetting.Issuer, subject)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	if !ok {
		if settings.Public.Auth.AllowRegister != nil && !*settings.Public.Auth.AllowRegister {
			return model.AuthSession{}, redirect, safeMessageError{message: "当前未开放注册"}
		}
		user = model.User{
			ID:          newID("user"),
			Username:    oidcUsername(profile),
			Email:       strings.TrimSpace(profile.Email),
			DisplayName: firstNonEmpty(profile.Name, profile.Nickname, profile.PreferredUsername, profile.Username),
			AvatarURL:   firstNonEmpty(profile.Picture, profile.AvatarURL),
			Role:        model.UserRoleUser,
			AffCode:     newAffCode(),
			OIDCIssuer:  oidcSetting.Issuer,
			OIDCSubject: subject,
			Status:      model.UserStatusActive,
			CreatedAt:   now(),
		}
	} else if user.Status == model.UserStatusBan {
		return model.AuthSession{}, redirect, safeMessageError{message: "账号已被禁用"}
	}
	user.Email = firstNonEmpty(profile.Email, user.Email)
	user.DisplayName = firstNonEmpty(profile.Name, profile.Nickname, profile.PreferredUsername, profile.Username, user.DisplayName)
	user.AvatarURL = firstNonEmpty(profile.Picture, profile.AvatarURL, user.AvatarURL)
	user.LastLoginAt = now()
	user.UpdatedAt = now()
	extra, _ := json.Marshal(userExtra{OIDC: profile})
	user.Extra = string(extra)
	user, err = repository.SaveUser(user)
	if err != nil {
		return model.AuthSession{}, redirect, err
	}
	session, err := newSession(user)
	return session, redirect, err
}

func ParseToken(tokenText string) (TokenClaims, error) {
	claims := TokenClaims{}
	token, err := jwt.ParseWithClaims(tokenText, &claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("登录状态无效")
		}
		return []byte(config.Cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return TokenClaims{}, errors.New("登录状态无效")
	}
	return claims, nil
}

func CurrentAuthUser(tokenText string) (model.AuthUser, bool) {
	claims, err := ParseToken(tokenText)
	if err != nil {
		return model.AuthUser{}, false
	}
	user, ok, err := repository.GetUserByID(claims.UserID)
	if err != nil || !ok {
		return model.AuthUser{}, false
	}
	if user.Status == model.UserStatusBan {
		return model.AuthUser{}, false
	}
	return model.PublicUser(user), true
}

func ListUsers(q model.Query) (model.UserList, error) {
	users, total, err := repository.ListUsers(q)
	if err != nil {
		return model.UserList{}, err
	}
	for i := range users {
		users[i].Password = ""
		normalizeUserDefaults(&users[i])
	}
	return model.UserList{Items: users, Total: int(total)}, nil
}

func SaveUser(user model.User, password string) (model.User, error) {
	user.Username = strings.TrimSpace(user.Username)
	if strings.ContainsAny(user.Username, " \t\r\n") {
		return user, safeMessageError{message: "用户名不能包含空格"}
	}
	if user.Username == "" {
		return user, safeMessageError{message: "用户名不能为空"}
	}
	if user.Role == "" || user.Role == model.UserRoleGuest {
		user.Role = model.UserRoleUser
	}
	if user.Status == "" {
		user.Status = model.UserStatusActive
	}
	if saved, ok, err := repository.GetUserByUsername(user.Username); err != nil {
		return user, err
	} else if ok && saved.ID != user.ID {
		return user, safeMessageError{message: "用户名已存在"}
	}
	isCreate := user.ID == ""
	if isCreate {
		user.ID = newID("user")
		user.AffCode = newAffCode()
		user.CreatedAt = now()
	} else if saved, ok, err := repository.GetUserByID(user.ID); err != nil {
		return user, err
	} else if ok {
		user.CreatedAt = saved.CreatedAt
		user.Password = saved.Password
		user.AvatarURL = saved.AvatarURL
		user.Credits = saved.Credits
		user.Extra = saved.Extra
		if user.AffCode == "" {
			user.AffCode = saved.AffCode
		}
		if user.AffCode == "" {
			user.AffCode = newAffCode()
		}
		if user.LinuxDoID == "" {
			user.LinuxDoID = saved.LinuxDoID
		}
		if user.OIDCIssuer == "" {
			user.OIDCIssuer = saved.OIDCIssuer
		}
		if user.OIDCSubject == "" {
			user.OIDCSubject = saved.OIDCSubject
		}
		user.LastLoginAt = saved.LastLoginAt
	}
	if password != "" {
		hash, err := hashPassword(password)
		if err != nil {
			return user, err
		}
		user.Password = hash
	}
	if isCreate && user.Password == "" {
		return user, safeMessageError{message: "密码不能为空"}
	}
	user.UpdatedAt = now()
	user, err := repository.SaveUser(user)
	user.Password = ""
	return user, err
}

func AdjustUserCredits(id string, credits int) (model.User, error) {
	user, ok, err := repository.GetUserByID(id)
	if err != nil || !ok {
		if err != nil {
			return user, err
		}
		return user, safeMessageError{message: "用户不存在"}
	}
	oldCredits := user.Credits
	user.Credits = credits
	user.UpdatedAt = now()
	user, err = repository.SaveUser(user)
	if err == nil && oldCredits != credits {
		_, err = repository.SaveCreditLog(model.CreditLog{
			ID:        newID("credit"),
			UserID:    user.ID,
			Type:      model.CreditLogTypeAdminAdjust,
			Amount:    credits - oldCredits,
			Balance:   credits,
			Remark:    "后台手动调整",
			CreatedAt: now(),
		})
	}
	user.Password = ""
	return user, err
}

func ConsumeUserCredits(userID string, modelName string, credits int, path string) error {
	if credits <= 0 {
		return nil
	}
	user, ok, err := repository.ConsumeUserCredits(userID, credits, now())
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "算力点不足"}
	}
	extra, _ := json.Marshal(map[string]string{"model": modelName, "path": path})
	_, err = repository.SaveCreditLog(model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeAIConsume,
		Amount:    -credits,
		Balance:   user.Credits,
		Remark:    "调用模型 " + modelName,
		Extra:     string(extra),
		CreatedAt: now(),
	})
	return err
}

func RefundUserCredits(userID string, modelName string, credits int, path string) error {
	if credits <= 0 {
		return nil
	}
	user, ok, err := repository.RefundUserCredits(userID, credits, now())
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "用户不存在"}
	}
	extra, _ := json.Marshal(map[string]string{"model": modelName, "path": path})
	_, err = repository.SaveCreditLog(model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeAIRefund,
		Amount:    credits,
		Balance:   user.Credits,
		Remark:    "模型调用失败返还 " + modelName,
		Extra:     string(extra),
		CreatedAt: now(),
	})
	return err
}

func ListCreditLogs(q model.Query) (model.CreditLogList, error) {
	logs, total, err := repository.ListCreditLogs(q)
	if err != nil {
		return model.CreditLogList{}, err
	}
	return model.CreditLogList{Items: logs, Total: int(total)}, nil
}

func SaveCreditLog(log model.CreditLog) (model.CreditLog, error) {
	if log.ID == "" {
		log.ID = newID("credit")
		log.CreatedAt = now()
	}
	return repository.SaveCreditLog(log)
}

func DeleteCreditLog(id string) error {
	return repository.DeleteCreditLog(id)
}

func DeleteUser(id string) error {
	return repository.DeleteUser(id)
}

func GuestUser() model.AuthUser {
	return model.AuthUser{ID: "", Username: "guest", Role: model.UserRoleGuest}
}

func newSession(user model.User) (model.AuthSession, error) {
	token, err := newToken(user)
	if err != nil {
		return model.AuthSession{}, err
	}
	return model.AuthSession{Token: token, User: model.PublicUser(user)}, nil
}

func newToken(user model.User) (string, error) {
	expireHours := config.Cfg.JWTExpireHours
	if expireHours <= 0 {
		expireHours = 168
	}
	claims := TokenClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expireHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.Cfg.JWTSecret))
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func now() string {
	return time.Now().Format(time.RFC3339)
}

func newID(prefix string) string {
	return prefix + "-" + uuid.NewString()
}

func newAffCode() string {
	return strings.ToUpper(strings.ReplaceAll(uuid.NewString()[:8], "-", ""))
}

func normalizeUserDefaults(user *model.User) {
	if user.Status == "" {
		user.Status = model.UserStatusActive
	}
	if user.AffCode == "" {
		user.AffCode = newAffCode()
	}
}

type linuxDoTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type linuxDoUserResponse struct {
	ID             int64  `json:"id"`
	Username       string `json:"username"`
	Name           string `json:"name"`
	AvatarTemplate string `json:"avatar_template"`
}

type oidcUserProfile struct {
	Sub               string `json:"sub"`
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	Name              string `json:"name"`
	Nickname          string `json:"nickname"`
	PreferredUsername string `json:"preferred_username"`
	Username          string `json:"username"`
	Picture           string `json:"picture"`
	AvatarURL         string `json:"avatar_url"`
}

type oidcRewriteTransport struct {
	base     http.RoundTripper
	public   *url.URL
	internal *url.URL
}

func linuxDoAccessToken(r *http.Request, code string, setting model.PrivateLinuxDoAuthSetting) (string, error) {
	values := url.Values{}
	values.Set("client_id", setting.ClientID)
	values.Set("client_secret", setting.ClientSecret)
	values.Set("grant_type", "authorization_code")
	values.Set("code", code)
	values.Set("redirect_uri", linuxDoRedirectURI(r))
	req, _ := http.NewRequest(http.MethodPost, config.Cfg.LinuxDoTokenURL, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var payload linuxDoTokenResponse
	if err := doLinuxDoJSON(req, &payload); err != nil {
		return "", err
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", safeMessageError{message: "Linux.do 登录失败"}
	}
	return payload.AccessToken, nil
}

func linuxDoRedirectURI(r *http.Request) string {
	return RequestOrigin(r) + "/api/auth/linux-do/callback"
}

func linuxDoProfile(token string) (linuxDoUserResponse, error) {
	req, _ := http.NewRequest(http.MethodGet, config.Cfg.LinuxDoUserInfoURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	var payload linuxDoUserResponse
	err := doLinuxDoJSON(req, &payload)
	return payload, err
}

func doLinuxDoJSON(req *http.Request, payload any) error {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return safeMessageError{message: "Linux.do 登录失败"}
	}
	return json.NewDecoder(bytes.NewReader(body)).Decode(payload)
}

func linuxDoUsername(username string, id string) string {
	base := strings.TrimSpace(username)
	if base == "" {
		base = "linuxdo-" + id
	}
	if _, ok, err := repository.GetUserByUsername(base); err != nil || !ok {
		return base
	}
	return base + "-" + id
}

func linuxDoAvatar(template string) string {
	if strings.TrimSpace(template) == "" {
		return ""
	}
	if strings.HasPrefix(template, "//") {
		template = "https:" + template
	}
	if strings.HasPrefix(template, "/") {
		template = "https://linux.do" + template
	}
	return strings.ReplaceAll(template, "{size}", "120")
}

func oidcRequestContext(r *http.Request, setting model.PrivateOIDCAuthSetting) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	client := oidcInternalHTTPClient(setting)
	if client == nil {
		return ctx, cancel
	}
	ctx = oidc.ClientContext(ctx, client)
	ctx = context.WithValue(ctx, oauth2.HTTPClient, client)
	return ctx, cancel
}

func oidcOAuthConfig(r *http.Request, provider *oidc.Provider, setting model.PrivateOIDCAuthSetting) *oauth2.Config {
	scopes := strings.Fields(setting.Scope)
	if !stringInSlice("openid", scopes) {
		scopes = append([]string{"openid"}, scopes...)
	}
	return &oauth2.Config{
		ClientID:     setting.ClientID,
		ClientSecret: setting.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  oidcRedirectURI(r),
		Scopes:       scopes,
	}
}

func oidcRedirectURI(r *http.Request) string {
	return RequestOrigin(r) + "/api/auth/oidc/callback"
}

func oidcInternalHTTPClient(setting model.PrivateOIDCAuthSetting) *http.Client {
	if setting.InternalIssuer == "" || setting.InternalIssuer == setting.Issuer {
		return nil
	}
	publicURL, publicErr := url.Parse(setting.Issuer)
	internalURL, internalErr := url.Parse(setting.InternalIssuer)
	if publicErr != nil || internalErr != nil || publicURL.Scheme == "" || publicURL.Host == "" || internalURL.Scheme == "" || internalURL.Host == "" {
		return nil
	}
	return &http.Client{
		Timeout: 15 * time.Second,
		Transport: oidcRewriteTransport{
			base:     http.DefaultTransport,
			public:   publicURL,
			internal: internalURL,
		},
	}
}

func (transport oidcRewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	if clone.URL.Scheme == transport.public.Scheme && clone.URL.Host == transport.public.Host {
		publicPath := strings.TrimRight(transport.public.Path, "/")
		internalPath := strings.TrimRight(transport.internal.Path, "/")
		if publicPath == "" || clone.URL.Path == publicPath || strings.HasPrefix(clone.URL.Path, publicPath+"/") {
			suffix := strings.TrimPrefix(clone.URL.Path, publicPath)
			clonedURL := *clone.URL
			clonedURL.Scheme = transport.internal.Scheme
			clonedURL.Host = transport.internal.Host
			clonedURL.Path = internalPath + suffix
			clonedURL.RawPath = ""
			clone.URL = &clonedURL
			clone.Host = transport.public.Host
		}
	}
	base := transport.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(clone)
}

func oidcProfile(ctx context.Context, provider *oidc.Provider, token *oauth2.Token, setting model.PrivateOIDCAuthSetting) (oidcUserProfile, error) {
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || strings.TrimSpace(rawIDToken) == "" {
		return oidcUserProfile{}, safeMessageError{message: "OIDC 登录失败：缺少 ID Token"}
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: setting.ClientID}).Verify(ctx, rawIDToken)
	if err != nil {
		return oidcUserProfile{}, safeMessageError{message: "OIDC ID Token 校验失败"}
	}
	profile := oidcUserProfile{}
	if err := idToken.Claims(&profile); err != nil {
		return oidcUserProfile{}, err
	}
	userInfo, err := provider.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err == nil {
		info := oidcUserProfile{}
		if userInfo.Claims(&info) == nil {
			profile = mergeOIDCProfile(profile, info)
		}
	}
	return profile, nil
}

func mergeOIDCProfile(base oidcUserProfile, extra oidcUserProfile) oidcUserProfile {
	return oidcUserProfile{
		Sub:               firstNonEmpty(base.Sub, extra.Sub),
		Email:             firstNonEmpty(extra.Email, base.Email),
		EmailVerified:     extra.EmailVerified || base.EmailVerified,
		Name:              firstNonEmpty(extra.Name, base.Name),
		Nickname:          firstNonEmpty(extra.Nickname, base.Nickname),
		PreferredUsername: firstNonEmpty(extra.PreferredUsername, base.PreferredUsername),
		Username:          firstNonEmpty(extra.Username, base.Username),
		Picture:           firstNonEmpty(extra.Picture, base.Picture),
		AvatarURL:         firstNonEmpty(extra.AvatarURL, base.AvatarURL),
	}
}

func oidcUsername(profile oidcUserProfile) string {
	base := firstNonEmpty(profile.PreferredUsername, profile.Username, emailLocalPart(profile.Email), profile.Nickname, profile.Name)
	base = strings.Join(strings.Fields(strings.TrimSpace(base)), "-")
	if base == "" {
		base = "oidc-" + oidcSubjectSuffix(profile.Sub)
	}
	if _, ok, err := repository.GetUserByUsername(base); err != nil || !ok {
		return base
	}
	return base + "-" + oidcSubjectSuffix(profile.Sub)
}

func emailLocalPart(email string) string {
	if index := strings.Index(email, "@"); index > 0 {
		return email[:index]
	}
	return ""
}

func oidcSubjectSuffix(subject string) string {
	suffix := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, subject)
	if len(suffix) > 12 {
		return suffix[:12]
	}
	if suffix == "" {
		return uuid.NewString()[:8]
	}
	return suffix
}

func oidcDisplayName(name string) string {
	if strings.TrimSpace(name) == "" {
		return "OIDC"
	}
	return strings.TrimSpace(name)
}

func stringInSlice(value string, values []string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func decodeState(state string) string {
	data, err := base64.RawURLEncoding.DecodeString(state)
	if err != nil {
		return "/"
	}
	return safeRedirectPath(string(data))
}

// safeRedirectPath 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的
// Tab/换行/回车，并把 //host 或 /\host 解析为协议相对的跨站地址，因此先剥离这些
// 控制字符，再拒绝 // 与 /\ 前缀。
func safeRedirectPath(redirect string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, redirect)
	if !strings.HasPrefix(cleaned, "/") || strings.HasPrefix(cleaned, "//") || strings.HasPrefix(cleaned, "/\\") {
		return "/"
	}
	return cleaned
}

func RequestOrigin(r *http.Request) string {
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = r.Host
	}
	proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if proto == "" {
		proto = "http"
	}
	return proto + "://" + host
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func WarnDefaultSecurityConfig() {
	if config.Cfg.AdminUsername == "admin" && config.Cfg.AdminPassword == "infinite-canvas" {
		log.Println("WARNING: using default admin credentials, please set ADMIN_USERNAME and ADMIN_PASSWORD to safer values before deployment")
	}
}
