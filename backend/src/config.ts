// Environment config loader
// Reads from .env file and process.env

const env = process.env;

export const config = {
  PORT: parseInt(env.PORT || "3001", 10),
  NODE_ENV: env.NODE_ENV || "development",

  // Amazon PAAPI
  AMAZON_ACCESS_KEY: env.AMAZON_ACCESS_KEY || "",
  AMAZON_SECRET_KEY: env.AMAZON_SECRET_KEY || "",
  AMAZON_PARTNER_TAG: env.AMAZON_PARTNER_TAG || "",

  // Twitter/X
  TWITTER_API_KEY: env.TWITTER_API_KEY || "",
  TWITTER_API_SECRET: env.TWITTER_API_SECRET || "",
  TWITTER_ACCESS_TOKEN: env.TWITTER_ACCESS_TOKEN || "",
  TWITTER_ACCESS_SECRET: env.TWITTER_ACCESS_SECRET || "",
  TWITTER_BEARER_TOKEN: env.TWITTER_BEARER_TOKEN || "",

  // Reddit
  REDDIT_CLIENT_ID: env.REDDIT_CLIENT_ID || "",
  REDDIT_CLIENT_SECRET: env.REDDIT_CLIENT_SECRET || "",

  // OpenAI
  OPENAI_API_KEY: env.OPENAI_API_KEY || "",

  // ClickBank (optional)
  CLICKBANK_DEV_KEY: env.CLICKBANK_DEV_KEY || "",
  CLICKBANK_CLERK_KEY: env.CLICKBANK_CLERK_KEY || "",

  // Redirect base URL for click tracking
  BASE_URL: env.BASE_URL || "http://localhost:3001",
  } as const;
