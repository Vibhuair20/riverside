package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func CorsConfig() fiber.Handler {
	return cors.New(cors.Config{
		AllowOrigins:     "http://localhost:5173,https://f0d6-2409-40c2-116-edd4-bd1b-8ebd-b955-b2f0.ngrok-free.app",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Upgrade, Connection",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
		ExposeHeaders:    "Content-Length, Content-Type",
	})
}
