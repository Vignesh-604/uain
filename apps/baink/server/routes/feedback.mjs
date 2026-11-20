// Feedback routes (server/feedback.mjs, docs/feedback.md).
//   POST /api/public/feedback          anyone, no key needed: send a report; the answer holds a receipt token, once
//   POST /api/public/feedback/status   anyone holding the report id and its receipt token: its status and reply
//   POST /api/feedback                 a signed member: send a report under its verified address
//   GET  /api/feedback                 a signed member: its own reports, newest first
// The receipt token goes in a POST body, never in a URL, so it is not written to access logs.
import { fail } from "../http-errors.mjs";
import { only } from "./context.mjs";

export function createFeedbackRoutes({ feedback, requester }) {
  return {
    name: "feedback",
    async public(ctx) {
      const { method, path } = ctx;
      if (method === "POST" && path === "/api/public/feedback") {
        only(ctx.query(), []);
        const { created, receipt } = feedback.create(ctx.body, { requester: requester(ctx.req) });
        return ctx.send(created ? 201 : 200, receipt);
      }
      if (method === "POST" && path === "/api/public/feedback/status") {
        only(ctx.query(), []);
        only(ctx.body, ["report", "receiptToken"]);
        return ctx.send(200, feedback.status(ctx.body.report, ctx.body.receiptToken, requester(ctx.req)));
      }
    },
    isPrivate: ({ path }) => path === "/api/feedback",
    async member(ctx) {
      const { method, path } = ctx;
      if (path !== "/api/feedback") return;
      only(ctx.query(), []);
      if (method === "GET") return ctx.send(200, feedback.mine(ctx.user.address));
      if (method === "POST") {
        const { created, receipt } = feedback.create(ctx.body, { member: ctx.user.address });
        return ctx.send(created ? 201 : 200, receipt);
      }
      fail(405, "method_not_allowed", "Use GET or POST.");
    },
  };
}
