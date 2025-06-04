import { cleanEnv, str } from "envalid";

const env = cleanEnv(process.env, {
  DUCKDB_PATH: str({ default: ":memory:" }),
});

export default env;
