package com.syntagma.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.syntagma.backend.dto.request.AiWordExplainRequest;
import com.syntagma.backend.dto.response.AiWordExplainResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private final RestTemplate aiRestTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.api.url}")
    private String apiUrl;

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.model}")
    private String model;

    @Value("${ai.word-explain.max-tokens:500}")
    private int maxTokens;

    public AiWordExplainResponse explainWord(AiWordExplainRequest request) {
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalStateException("AI API key is not configured");
        }

        int exampleCount = request.exampleCount() == null ? 2 : request.exampleCount();

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("max_tokens", maxTokens);
        body.put("stream", false);
        body.put("messages", buildMessages(request, exampleCount));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);
        headers.add("X-Title", "Syntagma");

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = aiRestTemplate.postForEntity(apiUrl, entity, Map.class);

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new IllegalArgumentException("AI request failed with status: " + response.getStatusCode());
        }

        String content = extractContent(response.getBody());
        String json = extractJson(content);

        try {
            return objectMapper.readValue(json, AiWordExplainResponse.class);
        } catch (Exception ex) {
            log.warn("AI response parsing failed. Raw content: {}", content);
            throw new IllegalArgumentException("AI response parsing failed");
        }
    }

    private List<Map<String, String>> buildMessages(AiWordExplainRequest request, int exampleCount) {
        StringBuilder user = new StringBuilder();
        user.append("Word: \"").append(request.word()).append("\"\n");
        user.append("Sentence: \"").append(request.sentence()).append("\"\n");
        if (StringUtils.hasText(request.context())) {
            user.append("Context: \"").append(request.context()).append("\"\n");
        }
        if (StringUtils.hasText(request.level())) {
            user.append("Learner level: ").append(request.level()).append("\n");
        }
        user.append("Examples requested: ").append(exampleCount);

        String system = "You help a Turkish-speaking English learner. "
                + "Return JSON only (no markdown). All fields must be filled. "
                + "meaning, partOfSpeech, usageNote, commonMistake must be in Turkish. "
                + "examples must be English sentences using the same sense as in the given sentence. "
                + "JSON schema: {\"meaning\":\"...\",\"partOfSpeech\":\"...\","
                + "\"usageNote\":\"...\",\"commonMistake\":\"...\",\"examples\":[\"...\"]}";

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", system));
        messages.add(Map.of("role", "user", "content", user.toString()));
        return messages;
    }

    @SuppressWarnings("unchecked")
    private String extractContent(Map<String, Object> body) {
        if (body == null) {
            throw new IllegalArgumentException("AI response body is empty");
        }
        List<Object> choices = (List<Object>) body.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new IllegalArgumentException("AI response choices are empty");
        }
        Map<String, Object> choice = (Map<String, Object>) choices.get(0);
        Map<String, Object> message = (Map<String, Object>) choice.get("message");
        if (message == null || message.get("content") == null) {
            throw new IllegalArgumentException("AI response content is empty");
        }
        return message.get("content").toString();
    }

    private String extractJson(String content) {
        String trimmed = content.trim();
        if (trimmed.startsWith("```")) {
            int start = trimmed.indexOf('\n');
            int end = trimmed.lastIndexOf("```");
            if (start != -1 && end > start) {
                return trimmed.substring(start, end).trim();
            }
        }
        return trimmed;
    }
}
