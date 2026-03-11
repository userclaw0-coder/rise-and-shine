# GitHub push 403 — what’s going on and what to do

## The "0" vs "o" difference

The difference isn’t in your token or in code. It’s in the **GitHub username**:

- **userclaw0-coder** = digit **0** (zero)  
- **userclawo-coder** = letter **o**

Your repo remote is set to **userclaw0-coder** (zero).  
Your `gh auth status` shows you’re logged in as **userclawo-coder** (letter o).  

So you’re pushing to an account (**0**) using a token for a different account (**o**). GitHub returns 403 because that token doesn’t have access to the other account’s repo.

## Why the keyring account shows "Active: false"

`gh` only marks one login as “active.” When **GITHUB_TOKEN** is set in the environment, `gh` always uses that and marks the **GITHUB_TOKEN** login as active. The keyring login is still there and was used for the web login, but it’s inactive as long as `GITHUB_TOKEN` is set. So you see:

- **GITHUB_TOKEN** (userclawo-coder) → Active: true  
- **keyring** (userclawo-coder) → Active: false  

Both are for **userclawo-coder** (letter o). Neither has write access to **userclaw0-coder**’s repo.

## What to do from here

You have to push using the account that **owns** the repo.

### If the repo is under userclaw0-coder (zero)

1. **Create a PAT for userclaw0-coder**  
   - Log into GitHub as **userclaw0-coder**.  
   - https://github.com/settings/tokens → Generate new token (classic).  
   - Scopes: **repo**, **read:org**, **workflow**.  
   - Copy the token once.

2. **Use that token for Git**  
   In a terminal:

   ```bash
   unset GITHUB_TOKEN
   export GITHUB_TOKEN=ghp_YourNewTokenForUserclaw0Coder
   cd ~/rise-and-shine
   git push origin develop
   ```

   To make it permanent, in `~/.bashrc` replace the current `export GITHUB_TOKEN=...` line with the new token (for userclaw0-coder).  
   Reload: `source ~/.bashrc` (note the dot in `.bashrc`).

3. **Optional: have gh use that account**  
   So `gh` and Git both use userclaw0-coder:

   ```bash
   unset GITHUB_TOKEN
   gh auth login
   ```
   Choose GitHub.com → HTTPS → “Paste an authentication token” and paste the **userclaw0-coder** PAT.  
   Then set that same token in `GITHUB_TOKEN` in `~/.bashrc` if you want `gh` to use it in every shell.

### If the repo is actually under userclawo-coder (letter o)

Then the remote URL was wrong. Set it to the letter “o” and push with your current login:

```bash
git remote set-url origin https://github.com/userclawo-coder/rise-and-shine.git
git push origin develop
```

If you get “Repository not found,” the repo does not exist under userclawo-coder; in that case the repo is under userclaw0-coder and you must use a token for that account as above.

## Quick check: which account owns the repo?

- In a browser, log into GitHub as **userclaw0-coder** and open  
  `https://github.com/userclaw0-coder/rise-and-shine`.  
  If you see the repo, it’s under the “0” account.
- Log in as **userclawo-coder** and open  
  `https://github.com/userclawo-coder/rise-and-shine`.  
  If you see it there, it’s under the “o” account.

Use the token for whichever account actually owns the repo.
