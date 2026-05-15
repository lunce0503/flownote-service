package com.flownote.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.flownote")
public class FlownoteServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlownoteServerApplication.class, args);
    }
}
