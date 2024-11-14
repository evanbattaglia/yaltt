import * as S from "@effect/schema/Schema";

export const LtiSupportedMessage = S.struct({
  type: S.string,
  placements: S.optional(S.array(S.string)),
});

export interface LtiSupportedMessage
  extends S.Schema.To<typeof LtiSupportedMessage> {}

export const LtiPlatformConfiguration = S.struct({
  product_family_code: S.string,
  version: S.string,
  messages_supported: S.array(LtiSupportedMessage),
  variables: S.optional(S.array(S.string)),
});

export interface LtiPlatformConfiguration
  extends S.Schema.To<typeof LtiPlatformConfiguration> {}
