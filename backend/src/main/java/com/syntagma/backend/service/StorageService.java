package com.syntagma.backend.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
public class StorageService {

    private final ObjectProvider<S3Client> s3ClientProvider;
    private final ObjectProvider<S3Presigner> s3PresignerProvider;

    @Value("${storage.s3.enabled:false}")
    private boolean storageEnabled;

    @Value("${storage.s3.bucket}")
    private String bucket;

    @Value("${storage.s3.presign-expiration-minutes:10}")
    private long presignExpirationMinutes;

    public StorageService(ObjectProvider<S3Client> s3ClientProvider,
                          ObjectProvider<S3Presigner> s3PresignerProvider) {
        this.s3ClientProvider = s3ClientProvider;
        this.s3PresignerProvider = s3PresignerProvider;
    }

    public StoragePresignResult createPresignedUpload(String objectKey, String contentType) {
        if (!storageEnabled) {
            return createMockPresignResult("upload", objectKey);
        }

        S3Presigner s3Presigner = s3PresignerProvider.getObject();
        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(presignExpirationMinutes))
                .putObjectRequest(putObjectRequest)
                .build();

        PresignedPutObjectRequest presigned = s3Presigner.presignPutObject(presignRequest);
        OffsetDateTime expiresAt = OffsetDateTime.ofInstant(presigned.expiration(), ZoneOffset.UTC);
        return new StoragePresignResult(presigned.url().toString(), expiresAt);
    }

    public StoragePresignResult createPresignedDownload(String objectKey) {
        if (!storageEnabled) {
            return createMockPresignResult("download", objectKey);
        }

        S3Presigner s3Presigner = s3PresignerProvider.getObject();
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(presignExpirationMinutes))
                .getObjectRequest(getObjectRequest)
                .build();

        PresignedGetObjectRequest presigned = s3Presigner.presignGetObject(presignRequest);
        OffsetDateTime expiresAt = OffsetDateTime.ofInstant(presigned.expiration(), ZoneOffset.UTC);
        return new StoragePresignResult(presigned.url().toString(), expiresAt);
    }

    public void deleteObject(String objectKey) {
        if (!storageEnabled) {
            return;
        }

        S3Client s3Client = s3ClientProvider.getObject();
        DeleteObjectRequest request = DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .build();
        s3Client.deleteObject(request);
    }

    private StoragePresignResult createMockPresignResult(String action, String objectKey) {
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC)
                .plusMinutes(presignExpirationMinutes);
        String safeKey = URLEncoder.encode(objectKey, StandardCharsets.UTF_8);
        String url = "https://mock-storage.local/" + action + "/" + safeKey;
        return new StoragePresignResult(url, expiresAt);
    }
}
