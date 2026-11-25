/*
 * Capability map content (from "Circulants Capability Map", Nov 2026).
 * Each domain is a section people can comment on. Scores: 0 gap … 4 product + proof.
 * Section ids (code / note id) key the comments, so don't rename them once comments exist.
 */
window.CAPABILITY_MAP = {
  eyebrow: 'Biopharma IT coverage · from circulants.com · Nov 2026',
  title: 'Where Circulants plays, and where it doesn’t',
  lede: 'Every major biopharma IT area, from discovery through patient services, scored by how much evidence Circulants’ own website gives of real work in it. Scores reflect what the site shows, not verified client delivery.',
  legend: [
    [4, 'Product + proof (case study or hiring)'],
    [3, 'Dedicated offering / detailed claims'],
    [2, 'Mentioned as a capability'],
    [1, 'Only as data source / integration'],
    [0, 'No evidence (gap)']
  ],
  domains: [
    { code: 'R&D', name: 'Research & Discovery', areas: [
      ['Bioinformatics & NGS pipelines', 4, 'PharmaSUG 2023 paper + 3 blog posts'],
      ['Genomics (single-cell, spatial)', 3, 'Discovery page; precision medicine'],
      ['Biomarker & translational science', 3, 'Biomarker validation, ctDNA analysis (CR2)'],
      ['Target ID, docking & lead optimization', 2, 'Listed on home page and CR2; no detail'],
      ['Medical imaging & annotation', 3, 'DICOM, CT/MRI, pathology; PhUSE 2025 paper'],
      ['Lab informatics (LIMS / ELN)', 0, 'Not mentioned']] },
    { code: 'CLIN', name: 'Clinical Development', areas: [
      ['Statistical programming (SDTM / ADaM)', 4, 'Submission-ready datasets; hiring SAS programmers'],
      ['Clinical data lake & data models', 3, 'CR2 four-zone clinical data lake'],
      ['Clinical operations BI', 3, 'Enrollment, screen failure, site performance'],
      ['Patient recruitment & feasibility', 2, 'Mentioned on clinical and AI pages'],
      ['CTMS', 2, 'Cloud CTMS mentioned'],
      ['EDC', 1, 'Only as an integration source'],
      ['IRT / RTSM & clinical supply', 0, 'Not mentioned'],
      ['eTMF / trial documents', 0, 'Not mentioned']] },
    { code: 'REG', name: 'Regulatory', areas: [
      ['Computer system validation & Part 11', 3, 'CSV, cloud qualification, paperless validation'],
      ['Submission data packages', 2, '“Regulatory submissions” on home page'],
      ['RIM & publishing', 0, 'Not mentioned']] },
    { code: 'PV', name: 'Safety / Pharmacovigilance', areas: [
      ['AI adverse-event & signal tagging', 2, 'PV NLP on annotation page'],
      ['Safety case management (Argus, ARISg)', 0, 'Not mentioned'],
      ['Aggregate safety reporting', 0, 'Not mentioned']] },
    { code: 'QA', name: 'Quality', areas: [
      ['Validated cloud & SAS environments', 4, 'cSPACE product + dedicated page + SAS PC package'],
      ['GxP quality processes (CAPA, deviation)', 2, 'Listed under CR2 Quality & Compliance'],
      ['Quality BI', 2, 'Deviation, CAPA, release metrics'],
      ['eQMS platforms (Veeva QMS, TrackWise)', 0, 'Not mentioned']] },
    { code: 'MFG', name: 'Manufacturing & CMC', areas: [
      ['Cell & gene therapy orchestration', 3, 'CG2: scheduling, chain of identity'],
      ['Manufacturing BI (batch, yield, OTIF)', 2, 'Advanced analytics page'],
      ['MES / electronic batch records', 0, 'Not mentioned'],
      ['Process analytics & historians', 0, 'Not mentioned']] },
    { code: 'SC', name: 'Supply Chain', areas: [
      ['CGT logistics & courier integration', 2, 'Biocair integration in CG2'],
      ['Demand & supply analytics', 1, 'Named as a data stream only'],
      ['ERP (SAP, Oracle)', 1, 'Generic “ERP” integration only'],
      ['Serialization & distribution (DSCSA, 3PL)', 0, 'Not mentioned']] },
    { code: 'COM', name: 'Commercial', areas: [
      ['Commercial data warehouse & HCP/HCO MDM', 4, 'O2, 2 case studies, PhUSE 2025 graph-MDM paper'],
      ['Launch readiness', 4, 'Case study: O2 live in 16 weeks after an FDA delay'],
      ['Segmentation & targeting', 4, 'O2 module; Navigator; case study'],
      ['Marketing mix & spend optimization', 4, 'Bayesian MMM; buy-and-bill case study'],
      ['Omnichannel & channel attribution', 4, 'Ophthalmology case with ROI by tactic'],
      ['Patient analytics (APLD, propensity)', 4, 'Osteoporosis case study; hiring APLD roles'],
      ['Call planning & HCP routing', 3, 'O2 module; Commercial page'],
      ['Forecasting', 3, 'ConvergeAI forecast module'],
      ['Territory, alignment & roster', 3, 'O2 modules; no case study'],
      ['Field reporting & insights', 3, 'Field insights dashboard; BI hiring'],
      ['CRM (Veeva Vault CRM, Salesforce LS)', 3, 'Dedicated CRM page; Agentforce'],
      ['Incentive compensation', 2, 'IC strategy & scorecards listed; no case study']] },
    { code: 'MA', name: 'Market Access & Pricing', areas: [
      ['Market access analytics', 2, '“Market access signals”'],
      ['Pricing optimization', 1, '“Optimize pricing” phrase only'],
      ['Contracting, rebates & gross-to-net', 0, 'Not mentioned'],
      ['Government pricing (Medicaid, 340B)', 0, 'Not mentioned']] },
    { code: 'MED', name: 'Medical Affairs', areas: [
      ['MLR content review', 2, 'MLR compliance on CRM page'],
      ['KOL identification', 2, 'KOL predictions on CRM page'],
      ['HEOR & real-world evidence', 1, 'RWE mentioned; HEOR not named'],
      ['MSL & medical information systems', 0, 'Not mentioned']] },
    { code: 'PAT', name: 'Patient Services', areas: [
      ['Adherence & patient journey analytics', 2, 'Commercial page'],
      ['Specialty pharmacy data', 1, 'Only in a team bio'],
      ['Hub, copay & reimbursement support', 0, 'Not mentioned']] },
    { code: 'ENT', name: 'Data, AI & Enterprise IT', areas: [
      ['Data engineering, lakes & pipelines', 4, 'Dedicated page + Databricks/AWS hiring'],
      ['BI & reporting (Power BI, Tableau)', 4, 'Dedicated page + 4 open BI roles'],
      ['Data governance & quality', 3, 'IDQR; Collibra, Informatica'],
      ['GenAI & agents', 3, 'ConvergeAI agents; PMSA 2026 agentic-AI talk'],
      ['Cloud migration & managed operations', 3, 'Cloud engineering page; 24x7 SLA claim'],
      ['Security & compliance', 2, 'ISO/IEC 27001:2022 certified; no SOC 2'],
      ['ERP, finance & HR systems', 0, 'Not mentioned'],
      ['Medical device & digital health', 1, 'Industry label only']] }
  ],
  notes: [
    { id: 'note-centre', title: 'Clear centre of gravity', items: [
      'Commercial analytics for emerging biopharma: data warehouse, HCP/HCO mastering, segmentation, marketing mix, omnichannel, patient analytics, launch readiness.',
      'Clinical statistical programming and validated SAS cloud, a niche most commercial-analytics rivals lack.',
      'Horizontal data engineering, BI and AI on Databricks, Snowflake, AWS and Azure.'] },
    { id: 'note-gaps', title: 'Notable gaps', items: [
      'Gross-to-net, contracting, rebates and government pricing.',
      'Patient hub services, medical affairs systems, safety case management.',
      'Lab (LIMS/ELN), MES, serialization, RIM/eTMF, IRT, and ERP (SAP).',
      'Incentive compensation is listed as a service but has no case study, unlike at rivals such as Axtria and Beghou.'] },
    { id: 'note-pubs', title: 'Publications and talks', items: [
      'PharmaSUG 2023 (San Francisco), paper SD-207: automating genomic data analysis on cloud for compliance. Authors include Koshatwar and Seera.',
      'PhUSE US 2025, paper ML15: pharma master data management with Neo4j knowledge graphs and GraphRAG.',
      'PhUSE US 2025, paper DH02: cloud image analysis (Joshi, Koshatwar).',
      'PMSA Fall Symposium 2026 (Princeton): Seera on agentic AI for market intelligence.',
      '4 blog posts (Mar–Oct 2025), all on bioinformatics or the CR+ data platform; 5 case-study PDFs, all commercial analytics.'] }
  ],
  foot: 'Method: 26 pages of circulants.com, 4 blog posts and 5 case-study PDFs were read on 22–25 Nov 2026, plus conference proceedings listings for PharmaSUG, PhUSE US and PMSA. The PhUSE 2025 papers are known from proceedings listings only; their full text could not be retrieved. All website claims are self-reported marketing copy. “Hiring” means an open role on the careers page. A 0 means the area is not mentioned in any source reviewed, not proof that Circulants has never done it.'
};
