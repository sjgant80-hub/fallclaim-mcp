#!/usr/bin/env node
/**
 * @ai-native-solutions/fallclaim-mcp
 * MCP stdio server exposing the fallclaim UK claims-quantum engine.
 * Research aid, not legal advice.
 * MIT License.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import sdk from '@ai-native-solutions/fallclaim-sdk';

const {
  VERSION, DISCLAIMER, META,
  CASE_TYPES, PROTOCOLS, WHIPLASH, JC_BRACKETS, OGDEN, T0_RULES,
  calcQuantum, calcLimitation, caseUrgency,
  searchBrackets, whiplashTariff, ogdenMultiplier,
  protocolStatus, assessPart36, askT0, feeCap
} = sdk;

const server = new Server(
  { name: 'fallclaim-mcp', version: VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

// ---------- Tool schemas ----------

const TOOLS = [
  {
    name: 'calc_quantum',
    description:
      'Estimate UK PI quantum from general damages, special damages, Ogden entries, whiplash band, and contributory-negligence percentage. Returns generals, specials, statutory interest, gross, and net after contributory deduction. Research aid, not legal advice.',
    inputSchema: {
      type: 'object',
      properties: {
        incidentDate: { type: 'string', description: 'ISO date of incident (used for interest calc).' },
        generalDamages: { type: 'number', description: 'PSLA assessment (£).' },
        specialDamages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              future: { type: 'boolean', description: 'true = future loss (no past-interest).' },
              category: { type: 'string' }
            },
            required: ['amount']
          }
        },
        ogdenEntries: {
          type: 'array',
          items: {
            type: 'object',
            properties: { multiplicand: { type: 'number' }, multiplier: { type: 'number' }, label: { type: 'string' } },
            required: ['multiplicand', 'multiplier']
          }
        },
        whiplashBand: { type: 'string', description: 'CLA 2018 band duration string, e.g. "<= 6 months".' },
        contributoryPct: { type: 'number', description: 'Contributory negligence percent (0-100).' }
      }
    }
  },
  {
    name: 'calc_limitation',
    description:
      'Compute the Limitation Act 1980 primary limitation date for a case, given case type and incident (or knowledge) date. 3 years for PI, 6 years for housing / mis-selling / data-breach.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Case type key. See list_reference for options.' },
        incidentDate: { type: 'string', description: 'ISO date of incident.' },
        dateOfKnowledge: { type: 'string', description: 'ISO date of knowledge (overrides incident).' }
      },
      required: ['type']
    }
  },
  {
    name: 'find_brackets',
    description:
      'Search Judicial College Guidelines (17th ed, 2024) PSLA brackets by body part and/or severity keyword. Returns matching brackets with lower/upper £ ranges. Advisory only - verify against current edition.',
    inputSchema: {
      type: 'object',
      properties: {
        part: { type: 'string', description: 'Body part key, e.g. neck, back, head/brain, psychiatric.' },
        severity: { type: 'string', description: 'Severity keyword, e.g. severe, moderate, minor, ptsd.' },
        query: { type: 'string', description: 'Free-text search across bracket names.' }
      }
    }
  },
  {
    name: 'whiplash_tariff',
    description:
      'Look up the Civil Liability Act 2018 s.3 whiplash tariff for a duration band. Returns PSLA and combined (with minor psych) figures. RTA whiplash claims where injuries last <= 24 months.',
    inputSchema: {
      type: 'object',
      properties: {
        band: { type: 'string', description: 'Duration band, e.g. "<= 6 months".' },
        minorPsych: { type: 'boolean', description: 'Include minor psychiatric uplift (default true).' }
      },
      required: ['band']
    }
  },
  {
    name: 'ogden_multiplier',
    description:
      'Return Ogden 8th edition multiplier for a claimant age. kind = "lifetime" (whole life) or "earnings" (term to age 68). Male table. Discount rate -0.25% (E&W).',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number', description: 'Claimant age in years.' },
        kind: { type: 'string', enum: ['lifetime', 'earnings'], description: 'lifetime = whole life; earnings = term to 68.' }
      },
      required: ['age']
    }
  },
  {
    name: 'protocol_schedule',
    description:
      'Generate a pre-action protocol step schedule with dates. Protocols: rta-portal, el-pl-portal, pre-action-pi, pre-action-clinical-neg, housing-disrepair, none.',
    inputSchema: {
      type: 'object',
      properties: {
        protocol: { type: 'string' },
        startDate: { type: 'string', description: 'ISO date the protocol started.' }
      },
      required: ['protocol', 'startDate']
    }
  },
  {
    name: 'assess_part36',
    description:
      'CPR Part 36 outcome assessment. Given claimant/defendant offer + trial award, return whether the offer was beaten, damages uplift (10% capped 75k for claimant), indemnity-cost consequences, and advisory verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['claimant', 'defendant'] },
        amount: { type: 'number', description: 'Offer amount (£).' },
        trialAward: { type: 'number', description: 'Actual award at trial (£).' }
      },
      required: ['side', 'amount', 'trialAward']
    }
  },
  {
    name: 'ask_t0',
    description:
      'Baseline (T0) rule-matched answer for common UK claims questions: PI limitation, whiplash tariff, MOJ portal, JC Guidelines, Ogden tables, contributory negligence, Part 36, Bolitho, QOCS, fundamental dishonesty, FCA CMR, FOS, small-claims threshold, and more. Deterministic, offline. No match = hand to a T1+ tier.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question']
    }
  },
  {
    name: 'fee_cap',
    description:
      'CFA / DBA fee-cap estimate. CFA success fee capped at 25% general damages + past losses (LASPO). DBA: 25% PI, 35% employment, 50% other (DBA Regs 2013).',
    inputSchema: {
      type: 'object',
      properties: {
        basis: { type: 'string', enum: ['cfa', 'dba-pi', 'dba-employment', 'dba'] },
        damages: { type: 'number' }
      },
      required: ['basis', 'damages']
    }
  }
];

// ---------- Resources ----------

const RESOURCES = [
  {
    uri: 'fallclaim://reference/case-types',
    name: 'Case types + limitation periods',
    mimeType: 'application/json',
    payload: () => CASE_TYPES
  },
  {
    uri: 'fallclaim://reference/protocols',
    name: 'Pre-action protocol step maps',
    mimeType: 'application/json',
    payload: () => PROTOCOLS
  },
  {
    uri: 'fallclaim://reference/whiplash',
    name: 'CLA 2018 whiplash tariff',
    mimeType: 'application/json',
    payload: () => WHIPLASH
  },
  {
    uri: 'fallclaim://reference/jc-brackets',
    name: 'JC Guidelines 17th ed PSLA brackets',
    mimeType: 'application/json',
    payload: () => JC_BRACKETS
  },
  {
    uri: 'fallclaim://reference/ogden',
    name: 'Ogden 8th ed multipliers (male, abridged)',
    mimeType: 'application/json',
    payload: () => OGDEN
  },
  {
    uri: 'fallclaim://reference/t0-rules',
    name: 'Baseline T0 rule set',
    mimeType: 'application/json',
    payload: () => T0_RULES
  },
  {
    uri: 'fallclaim://meta',
    name: 'FallClaim SDK metadata + disclaimer',
    mimeType: 'application/json',
    payload: () => ({ ...META, disclaimer: DISCLAIMER })
  }
];

// ---------- Handlers ----------

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES.map(r => ({ uri: r.uri, name: r.name, mimeType: r.mimeType }))
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = RESOURCES.find(x => x.uri === req.params.uri);
  if (!r) throw new Error('Unknown resource: ' + req.params.uri);
  return {
    contents: [{ uri: r.uri, mimeType: r.mimeType, text: JSON.stringify(r.payload(), null, 2) }]
  };
});

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    switch (name) {
      case 'calc_quantum': {
        const caseShape = {
          incidentDate: a.incidentDate,
          liability: { contributoryPct: Number(a.contributoryPct) || 0 },
          valuation: {
            generalDamages: { assessment: Number(a.generalDamages) || 0 },
            specialDamages: Array.isArray(a.specialDamages) ? a.specialDamages : [],
            ogdenEntries: Array.isArray(a.ogdenEntries) ? a.ogdenEntries : [],
            whiplashBand: a.whiplashBand || null,
            contributoryDeduction: a.contributoryPct != null ? Number(a.contributoryPct) : null
          }
        };
        return ok({ ...calcQuantum(caseShape), disclaimer: 'Research aid, not legal advice.' });
      }
      case 'calc_limitation': {
        const date = calcLimitation({
          type: a.type,
          incidentDate: a.incidentDate,
          dateOfKnowledge: a.dateOfKnowledge
        });
        const urg = caseUrgency({ limitationDate: date });
        return ok({ limitationDate: date, urgency: urg });
      }
      case 'find_brackets':
        return ok({ matches: searchBrackets({ part: a.part, sev: a.severity, query: a.query }) });
      case 'whiplash_tariff':
        return ok(whiplashTariff(a.band, { minorPsych: a.minorPsych !== false }) || { error: 'no matching band', bands: WHIPLASH.bands.map(b => b.dur) });
      case 'ogden_multiplier':
        return ok(ogdenMultiplier(Number(a.age), a.kind || 'lifetime'));
      case 'protocol_schedule':
        return ok(protocolStatus(a.protocol, new Date(a.startDate).getTime(), {}, Date.now()));
      case 'assess_part36':
        return ok(assessPart36({ side: a.side, amount: Number(a.amount) }, Number(a.trialAward)));
      case 'ask_t0': {
        const matches = askT0(a.question || '');
        return ok({
          matched: matches.length,
          answers: matches.map(r => ({ q: r.q, a: r.a })),
          disclaimer: 'Baseline reference only. Verify against primary sources.'
        });
      }
      case 'fee_cap':
        return ok(feeCap(a.basis, Number(a.damages)));
      default:
        return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: 'Error: ' + (err && err.message || String(err)) }], isError: true };
  }
});

// ---------- Boot ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('fallclaim-mcp v' + VERSION + ' listening on stdio');
}

main().catch((err) => {
  console.error('fallclaim-mcp fatal:', err);
  process.exit(1);
});
