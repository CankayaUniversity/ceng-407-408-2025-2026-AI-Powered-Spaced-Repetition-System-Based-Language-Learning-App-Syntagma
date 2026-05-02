package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.AiWordExplainRequest;
import com.syntagma.backend.dto.response.AiWordExplainResponse;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.service.AiService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    @PostMapping("/explain-word")
    public ResponseEntity<ApiResponse<AiWordExplainResponse>> explainWord(
            @Valid @RequestBody AiWordExplainRequest request) {
        AiWordExplainResponse response = aiService.explainWord(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
