package com.syntagma.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.syntagma.backend.dto.request.UserRegisterRequest;
import com.syntagma.backend.dto.response.UserResponse;
import com.syntagma.backend.exception.DuplicateResourceException;
import com.syntagma.backend.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @Test
    void register_Success() throws Exception {
        UserRegisterRequest request = new UserRegisterRequest("test@example.com", "password123");
        UserResponse mockResponse = new UserResponse(1L, "test@example.com", LocalDateTime.now(), null, 0);

        when(userService.register(any(UserRegisterRequest.class))).thenReturn(mockResponse);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.data.email").value("test@example.com"));
    }

    @Test
    void register_ValidationFailure() throws Exception {
        // Missing password and invalid email
        UserRegisterRequest request = new UserRegisterRequest("invalid-email", "");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("error"))
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_ERROR"));
    }
}
