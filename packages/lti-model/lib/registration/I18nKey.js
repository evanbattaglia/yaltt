import * as S from "@fp-ts/schema";
import { pipe } from "@fp-ts/core/Function";
export const I18nKey = (k) => pipe(S.record(S.literal(k), S.string), S.extend(S.record(S.templateLiteral(S.literal(`${k}#`), S.string), S.string)));
