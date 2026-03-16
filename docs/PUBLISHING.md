# Publishing to Visual Studio Marketplace

This document describes how to publish **Cursor Branch Chat** to the [Visual Studio Marketplace](https://marketplace.visualstudio.com/) so anyone can install it.

## Prerequisites

- A **Microsoft account** (used for both Marketplace and Azure DevOps).
- The project built and packaged as a `.vsix` (e.g. `cursor-branch-chat-0.2.0.vsix`).

## 1. Replace placeholders in the project

Before publishing, set your real URLs and publisher id:

1. **Repository and links**  
   In `package.json`, replace `your-username` in:
   - `repository.url`
   - `homepage`
   - `bugs.url`  
   with your actual GitHub (or other git host) username or org and repo name.  
   Example: `https://github.com/myorg/cursor-branch-chat.git`

2. **Publisher id**  
   After you create a publisher (step 2), set in `package.json`:
   - `publisher` to the **exact** publisher id you chose (e.g. `mycompany` or your username).  
   Then run `npm run compile` and `npx @vscode/vsce package` again so the new `.vsix` contains the correct publisher.

## 2. Create a publisher

1. Open [Visual Studio Marketplace – Publisher Management](https://marketplace.visualstudio.com/manage).
2. Sign in with your Microsoft account.
3. Click **Create Publisher**.
4. Choose a **Publisher ID** (e.g. your username or org name). This id will appear in the extension URL and in `package.json`; it cannot be changed later.
5. Fill in display name and other required fields, then create the publisher.

## 3. Create a Personal Access Token (PAT)

Publishing is done with a token from Azure DevOps:

1. Go to [Azure DevOps – User settings – Personal access tokens](https://dev.azure.com/_users/settings/tokens) (or from your profile → Security → Personal access tokens).
2. **New Token**.
3. Set a name (e.g. “VS Code Marketplace publish”).
4. **Organization**: choose “All accessible organizations” or the one you use.
5. **Scopes**: choose **Custom defined**, then enable **Marketplace** → **Manage**.
6. Set expiration (e.g. 1 year) and create the token.
7. Copy the token and store it somewhere safe; it will not be shown again.

## 4. Install vsce and log in

From the project root:

```bash
npm install -g @vscode/vsce
vsce login <your-publisher-id>
```

When prompted for the **Personal Access Token**, paste the PAT you created in step 3.

Use the same publisher id you set in `package.json`.

## 5. Publish the extension

1. Ensure `package.json` has the correct `publisher` and that you have built a new `.vsix` after any manifest changes:
   ```bash
   npm run compile
   npx @vscode/vsce package
   ```
2. Publish:
   ```bash
   vsce publish
   ```
   Or publish a specific `.vsix` without bumping version:
   ```bash
   vsce publish -p <path-to-.vsix>
   ```

The first time you publish, the extension will be created on the Marketplace. Later runs of `vsce publish` will publish a new version (version must be greater than the last published one).

## 6. After publishing

- The extension page will be:  
  `https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>`  
  e.g. `https://marketplace.visualstudio.com/items?itemName=cursor-branch-chat.cursor-branch-chat`
- Users can install it from the Extensions view in Cursor/VS Code by searching for “Cursor Branch Chat”.
- To release updates: bump `version` in `package.json` (and `package-lock.json`), update `CHANGELOG.md`, run `npm run compile`, `npx @vscode/vsce package`, then `vsce publish`.

## Troubleshooting

- **“Publisher not found”**  
  Make sure you are logged in with `vsce login <publisher-id>` and that `package.json`’s `publisher` matches exactly.

- **“Invalid resource” / 401**  
  Your PAT may have expired or lack **Marketplace → Manage**. Create a new token and run `vsce login` again.

- **Version already exists**  
  Increase the `version` in `package.json` (and in `package-lock.json` under `packages.""`) and repackage before publishing.
