import { route } from "@/server/http";
import { myJobs } from "@/server/view";

export const GET = route(async (_req, { user }) => ({ user, jobs: await myJobs(user.id) }));
