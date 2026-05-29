package com.syntagma.backend.controller;

import com.syntagma.backend.config.SecurityConfig;
import com.syntagma.backend.dto.response.CollectionResponse;
import com.syntagma.backend.security.JwtService;
import com.syntagma.backend.service.CollectionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CollectionController.class)
@Import(SecurityConfig.class)
class CollectionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private CollectionService collectionService;

    @MockBean
    private JwtService jwtService;

    @Test
    void getAll_UsesAuthenticatedJwtUserInsteadOfHeaderUser() throws Exception {
        when(jwtService.extractUserId("valid-token")).thenReturn(1L);
        when(jwtService.refreshToken("valid-token")).thenReturn("refreshed-token");
        when(collectionService.getAll(eq(1L), any(Pageable.class))).thenReturn(new PageImpl<>(List.of(
                new CollectionResponse(10L, 1L, "Deck", LocalDateTime.now(), List.of(), 0, 0)
        )));

        mockMvc.perform(get("/api/collections")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .header("X-User-Id", "999"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Refreshed-Token", "refreshed-token"))
                .andExpect(jsonPath("$.data.content[0].userId").value(1));

        verify(collectionService).getAll(eq(1L), any(Pageable.class));
        verify(collectionService, never()).getAll(eq(999L), any(Pageable.class));
    }
}
