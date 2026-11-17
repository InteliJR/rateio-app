import { createGooglePlayVerifier } from './google-play-verifier.factory';
import { FakeGooglePlayVerifier } from './fake-google-play.verifier';
import { GooglePlayApiVerifier } from './google-play-api.verifier';

describe('createGooglePlayVerifier', () => {
  const original = {
    verifier: process.env.GOOGLE_PLAY_VERIFIER,
    nodeEnv: process.env.NODE_ENV,
  };

  const restore = (key: string, value?: string) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    restore('GOOGLE_PLAY_VERIFIER', original.verifier);
    restore('NODE_ENV', original.nodeEnv);
  });

  it('usa a implementação real por padrão', () => {
    delete process.env.GOOGLE_PLAY_VERIFIER;

    expect(createGooglePlayVerifier()).toBeInstanceOf(GooglePlayApiVerifier);
  });

  it('usa a simulada quando GOOGLE_PLAY_VERIFIER=fake', () => {
    process.env.GOOGLE_PLAY_VERIFIER = 'fake';
    process.env.NODE_ENV = 'development';

    expect(createGooglePlayVerifier()).toBeInstanceOf(FakeGooglePlayVerifier);
  });

  it('recusa a simulada em produção', () => {
    process.env.GOOGLE_PLAY_VERIFIER = 'fake';
    process.env.NODE_ENV = 'production';

    expect(() => createGooglePlayVerifier()).toThrow(/produção/);
  });
});
