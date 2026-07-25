#!/bin/sh
set -e

# 由 nginx 官方镜像的入口在启动前自动执行（/docker-entrypoint.d/*.sh），随后 nginx 正常拉起。
# 从环境变量生成运行期配置 config.js。这里只能注入浏览器端公开配置，不能放密钥。

# GA4 / 百度 ID 只含字母、数字和连字符；过滤掉其它字符，
# 避免值里的引号等破坏 config.js 的 JS 字符串（纵深防御）。
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

escape_js_string() {
    printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")
BAIDU_ID=$(sanitize_id "${ANALYTICS_BAIDU_ID:-}")
LOGTO_ISSUER_VALUE=$(escape_js_string "${LOGTO_ISSUER:-}")
LOGTO_CLIENT_ID_VALUE=$(escape_js_string "${LOGTO_CLIENT_ID:-}")
LOGTO_SCOPE_VALUE=$(escape_js_string "${LOGTO_SCOPE:-openid profile email}")
NEW_API_BASE_URL_VALUE=$(escape_js_string "${NEW_API_BASE_URL:-}")
NEW_API_PUBLIC_URL_VALUE=$(escape_js_string "${NEW_API_PUBLIC_URL:-}")
NEW_API_DISPLAY_NAME_VALUE=$(escape_js_string "${NEW_API_DISPLAY_NAME:-New API}")
NEW_API_LOGTO_AUDIENCE_VALUE=$(escape_js_string "${NEW_API_LOGTO_AUDIENCE:-}")
NEW_API_LOGTO_SCOPE_VALUE=$(escape_js_string "${NEW_API_LOGTO_SCOPE:-ecosystem:me ecosystem:models:read ecosystem:tokens:read}")

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  LOGTO_ISSUER: "${LOGTO_ISSUER_VALUE}",
  LOGTO_CLIENT_ID: "${LOGTO_CLIENT_ID_VALUE}",
  LOGTO_SCOPE: "${LOGTO_SCOPE_VALUE}",
  NEW_API_BASE_URL: "${NEW_API_BASE_URL_VALUE}",
  NEW_API_PUBLIC_URL: "${NEW_API_PUBLIC_URL_VALUE}",
  NEW_API_DISPLAY_NAME: "${NEW_API_DISPLAY_NAME_VALUE}",
  NEW_API_LOGTO_AUDIENCE: "${NEW_API_LOGTO_AUDIENCE_VALUE}",
  NEW_API_LOGTO_SCOPE: "${NEW_API_LOGTO_SCOPE_VALUE}",
  ANALYTICS_GA4_ID: "${GA4_ID}",
  ANALYTICS_BAIDU_ID: "${BAIDU_ID}"
};
EOF
