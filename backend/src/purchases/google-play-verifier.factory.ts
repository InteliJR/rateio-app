import { Logger } from '@nestjs/common';
import { GooglePlayVerifier } from './google-play-verifier';
import { GooglePlayApiVerifier } from './google-play-api.verifier';
import { FakeGooglePlayVerifier } from './fake-google-play.verifier';

export function createGooglePlayVerifier(): GooglePlayVerifier {
  if (process.env.GOOGLE_PLAY_VERIFIER !== 'fake') {
    return new GooglePlayApiVerifier();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'GOOGLE_PLAY_VERIFIER=fake não é permitido em produção',
    );
  }

  new Logger('PurchasesModule').warn(
    'Verificador do Google Play SIMULADO ativo (GOOGLE_PLAY_VERIFIER=fake)',
  );
  return new FakeGooglePlayVerifier();
}
