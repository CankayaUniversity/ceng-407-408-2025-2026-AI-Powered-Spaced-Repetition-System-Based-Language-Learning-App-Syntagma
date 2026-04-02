package com.syntagma.backend.security;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.expiration}")
    private long jwtExpirationInMs;

    public String generateToken(Long userId) {
        Algorithm algorithm = Algorithm.HMAC256(secretKey);

        return JWT.create()
                .withSubject(String.valueOf(userId))
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + jwtExpirationInMs))
                .sign(algorithm);
    }

    public Long extractUserId(String token) {
        DecodedJWT decodedJWT = validateToken(token);
        if (decodedJWT != null) {
            return Long.parseLong(decodedJWT.getSubject());
        }
        return null;
    }

    public DecodedJWT validateToken(String token) {
        try {
            Algorithm algorithm = Algorithm.HMAC256(secretKey);
            return JWT.require(algorithm)
                    .build()
                    .verify(token);
        } catch (JWTVerificationException exception) {
            return null;
        }
    }
}
