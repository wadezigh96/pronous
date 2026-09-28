const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const { SKILLS, routeSkills } = require("../lib/skills");

module.exports = async function handler(req,res){
  if (!guardRequest(req, res)) return;
  const url=new URL(req.url,"http://localhost");
  const action=url.searchParams.get("action")||"list";

  if(action==="list") {
    return res.status(200).json({agent:"PRONOUS",network:"BSC_MAINNET",skills:SKILLS});
  }

  if(action==="route") {
    const q=url.searchParams.get("q")||"";
    if (q.length > 500) return res.status(400).json({error:"Invalid query"});
    return res.status(200).json({
      agent:"PRONOUS",
      query:q,
      skills:routeSkills(q)
    });
  }

  return res.status(400).json({error:"Unknown action"});
};
