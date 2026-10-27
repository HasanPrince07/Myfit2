const router = require("express").Router();

const member = require("../controller/member");
const plan = require("../controller/plan");
const billing = require("../controller/billing");

const trimRequestBody = require("../middleware/trimMiddleware");



router.get("/fetch-members", member.fetchMembers);
router.get("/fetch-member-by-id/:id", member.fetchMemberById);
router.post("/action-member/:id", trimRequestBody, member.actionMember);
router.delete("/delete-members", member.deleteMembers);
router.post("/renew-member/:id", trimRequestBody, member.renewMember);

router.get("/fetch-plans", plan.fetchPlans);
router.get("/fetch-billing-plans", plan.fetchBillingPlans);
router.get("/fetch-plan-by-id/:id", plan.fetchPlanById);
router.post("/action-plan/:id", trimRequestBody, plan.actionPlan);
router.delete("/delete-plans", plan.deletePlans);

router.get("/fetch-billings", billing.fetchBillings);
router.get("/fetch-billing-by-id/:id", billing.fetchBillingById);
router.delete("/delete-billings", billing.deleteBillings);
router.post("/generate-pdf", trimRequestBody, billing.generatePdf);


module.exports = router