const mediaService = require("../services/media.service");
const asyncHandler = require("../helpers/asyncHandler");

function imageHandler(resolve) {
  return asyncHandler(async (req, res) => {
    const image = await resolve(req);
    res.set({
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache", "X-Content-Type-Options": "nosniff",
      "Content-Type": image.contentType, "Content-Length": String(image.bytes.length),
      "Content-Disposition": "inline",
    });
    res.vary("Authorization");
    // res.end avoids Express's automatic ETag generation for sensitive bytes.
    res.status(200).end(image.bytes);
  });
}

module.exports = {
  avatar: imageHandler((req) => mediaService.avatar(req.params.userId, req.user)),
  signature: imageHandler((req) => mediaService.signature(req.params.userId, req.user)),
  historySignature: imageHandler((req) => mediaService.historySignature(req.params.historyId, req.user)),
  treatmentImage: imageHandler((req) => mediaService.treatmentImage(req.params.treatmentId, req.params.imageId, req.user)),
};
