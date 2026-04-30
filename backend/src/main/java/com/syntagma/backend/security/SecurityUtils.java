package com.syntagma.backend.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Utility class to extract the authenticated userId from the Spring SecurityContext.
 * The userId is set as the Principal by JwtAuthenticationFilter.
 */
public class SecurityUtils {

    private SecurityUtils() {}

    public static Long getAuthenticatedUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof Long userId) {
            return userId;
        }
        throw new IllegalStateException("No authenticated user found in SecurityContext");
    }
}
