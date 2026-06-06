import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(1)
  idToken: string;
}
