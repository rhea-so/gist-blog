# Gist Blog

### 1. Make GitHub Token

https://github.com/settings/tokens?type=beta

### 2. Convert GitHub Gists

```sh
HOSTNAME=<YOUR_WEBSITE_HOSTNAME> GITHUB_PERSONAL_ACCESS_TOKEN=<YOUR_TOKEN> npm run build
```

### 3. Test

```sh
cd build && python3 -m http.server
```
