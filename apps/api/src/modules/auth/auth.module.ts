import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ACCESS_TOKEN_EXPIRES_IN } from "../../config/constants.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET", "dev-secret-change"),
        signOptions: { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [JwtModule, PassportModule, AuthService, RolesGuard]
})
export class AuthModule {}
