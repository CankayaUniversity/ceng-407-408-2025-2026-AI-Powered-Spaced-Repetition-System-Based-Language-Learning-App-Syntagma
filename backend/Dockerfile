# Stage 1: Build the application
FROM gradle:8-jdk17-alpine AS builder

WORKDIR /app

# Copy gradle configuration
COPY settings.gradle ./
COPY build.gradle ./

# Download dependencies (this layer is cached unless dependencies change)
RUN gradle dependencies --no-daemon

# Copy source code and build
COPY src ./src
RUN gradle bootJar --no-daemon -x test

# Stage 2: Create the minimal runtime image
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Copy the built jar from the builder stage
COPY --from=builder /app/build/libs/*.jar app.jar

# Expose port (Spring Boot default is 8080)
EXPOSE 8080

# Run the jar file
ENTRYPOINT ["java", "-jar", "app.jar"]
