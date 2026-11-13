import * as oidc from "openid-client";

export type LoginAttempt = { state: string; nonce: string; verifier: string };
export type GoogleIdentity = {
  start(attempt: LoginAttempt): Promise<URL>;
  finish(url: URL, attempt: LoginAttempt): Promise<string>;
};

export function googleIdentity(
  clientId: string,
  secret: string,
  redirect: URL,
): GoogleIdentity {
  let configuration: Promise<oidc.Configuration> | undefined;
  const config = () => configuration ??= oidc.discovery(
    new URL("https://accounts.google.com"),
    clientId,
    { id_token_signed_response_alg: "RS256", token_endpoint_auth_method: "client_secret_post" },
    oidc.ClientSecretPost(secret),
    { execute: [oidc.enableNonRepudiationChecks], timeout: 8,
      [oidc.customFetch]: (url, { body, ...options }) =>
        fetch(url, { ...options, body: body instanceof Uint8Array ? Uint8Array.from(body) : body }) },
  ).catch((error: unknown) => {
    configuration = undefined;
    throw error;
  });
  return {
    async start({ state, nonce, verifier }) {
      return oidc.buildAuthorizationUrl(await config(), {
        redirect_uri: redirect.href,
        scope: "openid email",
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      });
    },
    async finish(url, { state, nonce, verifier }) {
      const response = await oidc.authorizationCodeGrant(await config(), url, {
        expectedState: state,
        expectedNonce: nonce,
        pkceCodeVerifier: verifier,
      });
      const claims = response.claims();
      if (!claims || typeof claims.sub !== "string" || !/^[\x21-\x7e]{1,255}$/.test(claims.sub))
        throw new Error("invalid-google-identity");
      return claims.sub;
    },
  };
}
