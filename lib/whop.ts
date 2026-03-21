import Whop from "@whop/sdk";
import { Account } from "./db";
export function getWhop(account: Account): any {
  return new Whop({ apiKey: account.whop_api_key });
}
