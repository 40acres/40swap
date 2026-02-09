# Authentication Setup - Implementation Complete ✅

## Overview
The liquidity manager application now has full OIDC-based authentication using Keycloak as the identity provider, with session-based authentication (no JWT validation) protecting both frontend and backend.

## Running Services

### 1. Keycloak
- **URL**: http://localhost:8080
- **Admin Console**: http://localhost:8080/admin
- **Admin Credentials**: admin / admin
- **Realm**: 40swap
- **Database**: PostgreSQL (shared with backend, port 5434, database: keycloak)
- **Status**: ✅ Running in Docker

### 2. Backend API
- **URL**: http://localhost:7082
- **API Docs**: http://localhost:7082/api/docs
- **Health**: http://localhost:7082/api/health (public)
- **Auth Endpoints**:
  - `GET /api/auth/login` - Initiate login
  - `GET /api/auth/callback` - OIDC callback
  - `GET /api/auth/logout` - Logout
  - `GET /api/auth/session` - Get session info
- **Status**: ✅ Running with `npm run start:dev`

### 3. Frontend
- **URL**: http://localhost:7084
- **Status**: ✅ Running with `npm start`

### 4. PostgreSQL (Shared)
- **Port**: 5434
- **Databases**: 
  - `liquidity_manager` - Backend sessions
  - `keycloak` - Keycloak data (users, realms, clients)
- **Status**: ✅ Running in Docker

## Test Users

| Username | Password | Email |
|----------|----------|-------|
| admin | admin123 | admin@40swap.local |
| user1 | user123 | user1@40swap.local |
| user2 | user123 | user2@40swap.local |

## Testing the Authentication Flow

### 1. Access the Application
Open http://localhost:7084 in your browser

### 2. You Should See
- Login page with "Sign In with Keycloak" button
- Test credentials displayed

### 3. Click "Sign In with Keycloak"
- Redirects to Keycloak login page
- Enter credentials (e.g., admin / admin123)
- Redirects back to application

### 4. After Login
- See your username in the navbar dropdown
- Can access Channels and History pages
- All API calls include session cookies

### 5. Test Logout
- Click username dropdown → Logout
- Redirects to Keycloak logout
- Returns to login page

## Architecture

### Flow Diagram
```
Browser → Frontend (7084) → Vite Proxy → Backend (7082) → Keycloak (8080)
                                             ↓                    ↓
                                             └─── PostgreSQL ─────┘
                                                  (Port 5432)
                                                  - liquidity_manager db (sessions)
                                                  - keycloak db (auth data)
```

### Authentication Flow
1. **Login**: User clicks login → Backend redirects to Keycloak
2. **Keycloak Auth**: User enters credentials
3. **Callback**: Keycloak redirects back with auth code
4. **Token Exchange**: Backend exchanges code for tokens (with PKCE)
5. **UserInfo**: Backend fetches user info from Keycloak
6. **Session**: Backend creates session in PostgreSQL
7. **Cookie**: Session ID sent to browser as httpOnly cookie
8. **API Calls**: All subsequent API calls include session cookie
9. **Auth Guard**: Backend validates session on each protected endpoint

### Security Features
- ✅ **PKCE** (Proof Key for Code Exchange) for public clients
- ✅ **Session-based** authentication (no JWT validation)
- ✅ **HttpOnly cookies** (XSS protection)
- ✅ **SameSite=lax** (CSRF protection)
- ✅ **PostgreSQL session storage** (survives restarts)
- ✅ **CORS** configured for credentials
- ✅ **Auth guard** on all API endpoints (except health)

## Configuration

All authentication configuration is managed through the YAML configuration file (`dev/liquidity-manager.conf.yaml`). No environment variables are required.

### Configuration Schema

The authentication settings are defined in the `auth` section:

```yaml
auth:
  keycloak:
    url: http://localhost:8080          # Keycloak server URL
    realm: 40swap                        # Keycloak realm name
    clientId: liquidity-manager          # OIDC client ID
  session:
    secret: your-secret-key-here         # Session encryption secret (change in production!)
    maxAge: 28800000                     # Session lifetime in milliseconds (8 hours = 28800000ms)
  urls:
    backend: http://localhost:7082       # Backend URL for OIDC redirect URI
    frontend: http://localhost:7084      # Frontend URL for CORS and post-logout redirect
```

### Configuration Properties

#### Keycloak Settings (`auth.keycloak`)
- **url**: Base URL of your Keycloak instance
- **realm**: Name of the Keycloak realm containing your client and users
- **clientId**: OIDC client ID configured in Keycloak

#### Session Settings (`auth.session`)
- **secret**: Secret key used to sign session cookies. **Must be changed in production!**
- **maxAge**: Session lifetime in milliseconds before expiration (default: 8 hours)

#### URL Settings (`auth.urls`)
- **backend**: Base URL of the backend API. Used for constructing OIDC callback redirects.
- **frontend**: Base URL of the frontend application. Used for CORS configuration and post-logout redirects.

### Security Considerations

- Always use a strong, randomly generated `session.secret` in production
- Session cookies are:
  - **httpOnly**: Cannot be accessed by JavaScript (prevents XSS attacks)
  - **sameSite: 'lax'**: Provides CSRF protection while allowing redirects
  - **secure**: Set to `true` in production (HTTPS only)

## Database Schema

### Session Table
```sql
CREATE TABLE session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IDX_session_expire ON session (expire);
```

Migration automatically run on backend startup.

## Files Modified/Created

### Backend
- `src/OidcService.ts` - OIDC client wrapper
- `src/AuthController.ts` - Auth endpoints
- `src/AuthGuard.ts` - Session validation guard
- `src/PublicDecorator.ts` - Mark public endpoints
- `src/main.ts` - Session middleware, CORS
- `src/AppModule.ts` - Register auth services
- `src/migrations/1738670000001-session.ts` - Session table
- `package.json` - Added dependencies

### Frontend
- `src/services/AuthService.ts` - Auth API calls
- `src/services/AuthContext.tsx` - Auth state management
- `src/components/LoginPage.tsx` - Login UI
- `src/components/ProtectedRoute.tsx` - Route guard
- `src/App.tsx` - Auth provider, user dropdown
- `src/services/ApiService.ts` - Added credentials
- `vite.config.js` - Updated proxy

### Docker
- `docker/docker-compose.yml` - Added Keycloak service
- `docker/keycloak/realm-export.json` - Realm config with users

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running: `docker ps | grep postgres`
- Check Keycloak is accessible: `curl http://localhost:8080/realms/40swap/.well-known/openid-configuration`

### Login redirects to error page
- Check browser console for errors
- Check backend logs for authentication errors
- Verify Keycloak realm and client configuration

### Session not persisting
- Check session table: `psql -h localhost -p 5434 -U 40swap -d liquidity_manager -c "SELECT * FROM session;"`
- Check cookie is being set in browser DevTools → Application → Cookies

### CORS errors
- Verify frontend URL in backend CORS whitelist
- Check browser is sending credentials: DevTools → Network → check "credentials: include"

## Next Steps

### Production Deployment
1. Set `NODE_ENV=production`
2. Use HTTPS for all services
3. Generate strong `SESSION_SECRET`
4. Configure Keycloak with proper realm settings
5. Use real SSL certificates
6. Set `secure: true` for cookies
7. Configure proper Keycloak redirect URIs

### Additional Features
- Role-based access control (RBAC)
- Remember me functionality
- Session timeout warnings
- Multi-factor authentication (MFA)
- Audit logging

## Support

For issues or questions:
1. Check backend logs: `docker logs 40swap_keycloak`
2. Check session table contents
3. Verify Keycloak realm configuration
4. Review browser console and network tab

---

**Status**: ✅ All authentication features implemented and working
**Last Updated**: 2026-02-04
