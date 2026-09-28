const { guardRequest, isAddress, isAmount, safeError, requireSameOrigin } = require("../lib/http-policy");
const { createPOA, verifyPOA, buildIntentHash } = require("../lib/poa");

module.exports = async function handler(req,res){
  if (!guardRequest(req, res)) return;
  if (!["GET","POST"].includes(req.method)) return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
  try {
    const url = new URL(req.url,"http://localhost");
    const action = url.searchParams.get("action") || "info";
    if (!["info","create","verify"].includes(action)) return res.status(400).json({error:"Unknown POA action"});

    if (action === "info") {
      if (req.method !== "GET") return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
      return res.status(200).json({
        agent:"PRONOUS",
        skill:"proof_of_action",
        version:"POA-1",
        purpose:"Tamper-evident evidence for agent actions.",
        lifecycle:["PLANNED","SIMULATED","CONFIRMED","EXECUTED","BLOCKED","REJECTED","EXPIRED"],
        broadcast:false
      });
    }

    if (action === "create") {
      if (req.method !== "POST") return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
      if (!requireSameOrigin(req, res)) return;
      const raw = await new Promise((resolve) => {
        let body=""; req.on("data", c => { body += c; if (body.length > 200000) { req.destroy(); resolve(""); } });
        req.on("end", () => resolve(body)); req.on("error", () => resolve("")); });
      let parsed;
      try { parsed = JSON.parse(raw || "{}"); } catch (_) { return res.status(400).json({error:"Invalid request JSON"}); }
      const proofValue = parsed.proof ?? parsed;
      if (!proofValue || typeof proofValue !== "object") return res.status(400).json({error:"proof JSON is required"});
      const input = proofValue;
      if (input.intent?.wallet && !isAddress(input.intent.wallet)) return res.status(400).json({error:"Invalid intent wallet"});
      if (input.intent?.amount != null && !isAmount(input.intent.amount)) return res.status(400).json({error:"Invalid intent amount"});
      if (input.txHash && !/^0x[a-fA-F0-9]{64}$/.test(String(input.txHash))) return res.status(400).json({error:"Invalid txHash"});
      if (!input.intentHash && input.intent) input.intentHash = buildIntentHash(input.intent);
      const proof = createPOA(input);
      return res.status(200).json({agent:"PRONOUS",skill:"proof_of_action",proof});
    }

    if (action === "verify") {
      if (req.method !== "GET") return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
      if (!requireSameOrigin(req, res)) return;
      const raw = url.searchParams.get("proof");
      if (!raw) return res.status(400).json({error:"proof JSON is required"});
      let proof;
      try { proof = JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid proof JSON"}); }
      return res.status(200).json({agent:"PRONOUS",skill:"proof_of_action",verification:verifyPOA(proof)});
    }

    return res.status(400).json({error:"Unknown POA action"});
  } catch (e) {
    return safeError(res, 400, "POA_REQUEST_FAILED");
  }
};
