# Gist Blog

### 1. Fork this Repository

https://github.com/rhea-so/gist-blog/fork

### 2. Make GitHub Token

https://github.com/settings/tokens?type=beta

### 3. Convert GitHub Gists

```sh
HOSTNAME=<YOUR_WEBSITE_HOSTNAME> GITHUB_PERSONAL_ACCESS_TOKEN=<YOUR_TOKEN> npm run build
```

### 4. Test

```sh
cd build && python3 -m http.server
```

### 5. Publish

zip build folder and upload
