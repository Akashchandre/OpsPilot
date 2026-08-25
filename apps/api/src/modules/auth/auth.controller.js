import { clearAuthenticationCookies, setAuthenticationCookies } from "./auth.cookies.js";
import { presentUser } from "./auth.presenter.js";

export function createAuthController(authService, config) {
  return {
    async register(request, response, next) {
      try {
        response.setHeader("Cache-Control", "no-store");
        const result = await authService.register({
          ...request.validated.body,
          requestId: request.id,
          userAgent: request.get("User-Agent"),
        });
        setAuthenticationCookies(response, config, result.session);
        response.status(201).json({ success: true, data: { user: result.user } });
      } catch (error) {
        next(error);
      }
    },

    async login(request, response, next) {
      try {
        response.setHeader("Cache-Control", "no-store");
        const result = await authService.login({
          ...request.validated.body,
          requestId: request.id,
          userAgent: request.get("User-Agent"),
        });
        setAuthenticationCookies(response, config, result.session);
        response.status(200).json({ success: true, data: { user: result.user } });
      } catch (error) {
        next(error);
      }
    },

    currentUser(request, response) {
      response.status(200).json({
        success: true,
        data: { user: presentUser(request.auth.user) },
      });
    },

    async logout(request, response, next) {
      try {
        await authService.logout({
          sessionId: request.auth.session.id,
          userId: request.auth.user.id,
          requestId: request.id,
        });
        clearAuthenticationCookies(response, config);
        response.status(200).json({ success: true, data: { loggedOut: true } });
      } catch (error) {
        next(error);
      }
    },
  };
}
