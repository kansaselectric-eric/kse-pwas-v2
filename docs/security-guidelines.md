## Security Guidelines

### API Key Management
- Never hardcode secrets in source code.
- Use Apps Script Properties Service or secure secret managers.
- Rotate keys periodically and grant least privilege.

### Environment Variables
- For web apps, avoid exposing secrets in client-side code.
- Use server-side proxies (Apps Script) for calls requiring credentials.
- Store non-sensitive config in environment variables or Netlify build settings.

### What NOT to Commit
- Secrets (API keys, OAuth tokens, service account JSON).
- Private customer data exports.
- Certificates or private keys.
- Credentials files from local development.

### Additional Practices
- Enforce HTTPS everywhere.
- Validate all inputs server-side; sanitize filenames and content types.
- Log access in Apps Script where appropriate; avoid logging sensitive data.
- Principle of least privilege for Drive/Sheets permissions.


