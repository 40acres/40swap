# Authentication Setup - Implementation Complete ✅

## Overview
The liquidity manager application now has full OIDC-based authentication using Keycloak as the identity provider, with session-based authentication (no JWT validation) protecting both frontend and backend.

## Running Services

### 1. Keycloak
- **URL**: http://localhost:8080
- **Admin Console**: http://localhost:8080/admin
- **Admin Credentials**: admin / admin
- **Realm**: 40swap
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

### 4. PostgreSQL (Sessions)
- **Port**: 5434
- **Database**: liquidity_manager
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
                                             ↓
                                        PostgreSQL (5434)
                                        (Session Storage)
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

## Environment Variables

### Backend (.env or export)
```bash
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=40swap
KEYCLOAK_CLIENT_ID=liquidity-manager
SESSION_SECRET=development-secret
BACKEND_URL=http://localhost:7082
FRONTEND_URL=http://localhost:7084
```

### Session Configuration
- **Idle Timeout**: 30 minutes (cookie maxAge: 8 hours)
- **Storage**: PostgreSQL table `session`
- **Cookie**: httpOnly, secure (production), sameSite=lax

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
