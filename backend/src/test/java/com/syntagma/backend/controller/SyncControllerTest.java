package com.syntagma.backend.controller;

import com.syntagma.backend.config.SecurityConfig;
import com.syntagma.backend.dto.response.SyncStatusResponse;
import com.syntagma.backend.security.JwtService;
import com.syntagma.backend.service.SyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SyncController.class)
@Import(SecurityConfig.class)
class SyncControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SyncService syncService;

    @MockBean
    private JwtService jwtService;

    @Test
    void status_UsesAuthenticatedJwtUserInsteadOfHeaderUser() throws Exception {
        when(jwtService.extractUserId("valid-token")).thenReturn(1L);
        when(jwtService.refreshToken("valid-token")).thenReturn("refreshed-token");
        when(syncService.getStatus(1L)).thenReturn(new SyncStatusResponse(LocalDateTime.now(), 2, 0));

        mockMvc.perform(get("/api/sync/status")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .header("X-User-Id", "999"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Refreshed-Token", "refreshed-token"))
                .andExpect(jsonPath("$.data.pendingEvents").value(2));

        verify(syncService).getStatus(1L);
        verify(syncService, never()).getStatus(999L);
    }
}
