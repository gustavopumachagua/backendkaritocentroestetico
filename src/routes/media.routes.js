const router = require("express").Router();
const authJwt = require("../middlewares/authJwt");
const controller = require("../controllers/media.controller");
const { mediaReadRateLimiter } = require("../middlewares/rateLimit");

router.use(authJwt);
router.use(mediaReadRateLimiter);
router.get("/avatars/:userId", controller.avatar);
router.get("/signatures/:userId", controller.signature);
router.get("/histories/:historyId/signature", controller.historySignature);
router.get("/treatments/:treatmentId/images/:imageId", controller.treatmentImage);

module.exports = router;
