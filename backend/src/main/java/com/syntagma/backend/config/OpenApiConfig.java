package com.syntagma.backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI syntagmaOpenAPI() {
        return new OpenAPI()
                .info(new Info().title("Syntagma REST API")
                        .description("Backend API for the Syntagma AI-Powered Language Learning App")
                        .version("1.0.0")
                        .contact(new Contact().name("Syntagma Team")));
    }
}
