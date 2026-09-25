const { createPOA, verifyPOA, buildIntentHash } = require("../lib/poa");

module.exports = async function handler(req,res){
  try {
    const url = new URL(req.url,"http://localhost");
    const action = url.searchParams.get("action") || "info";

    if (action === "info") {
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
      const raw = url.searchParams.get("proof");
      if (!raw) return res.status(400).json({error:"proof JSON is required"});
      let input;
      try { input = JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid proof JSON"}); }
      if (!input.intentHash && input.intent) input.intentHash = buildIntentHash(input.intent);
      const proof = createPOA(input);
      return res.status(200).json({agent:"PRONOUS",skill:"proof_of_action",proof});
    }

    if (action === "verify") {
      const raw = url.searchParams.get("proof");
      if (!raw) return res.status(400).json({error:"proof JSON is required"});
      let proof;
      try { proof = JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid proof JSON"}); }
      return res.status(200).json({agent:"PRONOUS",skill:"proof_of_action",verification:verifyPOA(proof)});
    }

    return res.status(400).json({error:"Unknown POA action"});
  } catch (e) {
    return res.status(400).json({agent:"PRONOUS",skill:"proof_of_action",error:e.message||"POA error"});
  }
};
