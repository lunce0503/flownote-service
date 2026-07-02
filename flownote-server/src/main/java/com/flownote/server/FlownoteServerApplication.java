package com.flownote.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.flownote")
@EnableScheduling
public class FlownoteServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlownoteServerApplication.class, args);
    }
}
