/*
 * Configuration for the Org Assessment site.
 * Edit questions and columns here — no build step needed.
 *
 * Column types: text | textarea | number | currency | percent | date | select | computed
 *   - select options can be strings or { value, label, tone } where tone is good | warn | bad
 *   - suggest: id of a datalist to offer autocomplete (dl-people, dl-locations, dl-roles, dl-skills, dl-projects)
 *   - computed: provide compute(row, allRows) and format ('percent' | 'currency' | 'number')
 */
window.APP_CONFIG = {
  appTitle: 'Circulants · Org Assessment',
  storageKey: 'circulants-org-assessment-v1',
  currency: 'USD',
  locale: 'en-US', // e.g. 'en-IN' or 'en-US'; undefined = browser default

  questions: [
    // Strategy & business
    { id: 'priorities', section: 'Strategy & business', text: 'What are the organization’s top 3 priorities/OKRs for the next 12 months?' },
    { id: 'strategy', section: 'Strategy & business', text: 'What are the top 3 things to fix in the first 90 days?' },
    { id: 'revenue_mix', section: 'Strategy & business', text: 'Which clients drive most of the revenue and margin? Where is the concentration risk?' },
    { id: 'pipeline', section: 'Strategy & business', text: 'What does the sales pipeline look like for the next two quarters?', hint: 'Named deals, stage, expected value, confidence.' },
    { id: 'positioning', section: 'Strategy & business', text: 'How do we differentiate from competitors? Why do clients choose us?' },
    
    //Client relationships
    { id: 'client_relationships', section: 'Client relationships', text: 'How is client relationship managed post the initial sales cycle? Who manages this?' },
    { id: 'recurring_revenue', section: 'Client relationships', text: 'What % of revenue is from repeat business/ account growth' },
    { id: 'client_churn', section: 'Client relationships', text: 'When you lose a deal, who do you lose to, and why?' },
    { id: 'client_churn', section: 'Client relationships', text: 'what is the client churn rate over the last 12 months?', hint: 'CSAT, NPS, quarterly business reviews, etc.' },

    // Delivery
    { id: 'delivery_quality', section: 'Delivery', text: 'How is delivery quality measured today?', hint: 'Metrics, reviews, CSAT, delivery governance.' },
    { id: 'delivery_issues', section: 'Delivery', text: 'What are the top 2-3 recurring delivery problems?', hint : 'Missed deadlines, quality issues, scope creep, resourcing gaps, etc.' },
    { id: 'at_risk', section: 'Delivery', text: 'Which projects or accounts are currently at risk, and why?' },
    { id: 'governance', section: 'Delivery', text: 'What governance cadences exist?', hint: 'Weekly status, monthly reviews, QBRs, steering committees.' },

    // People
    { id: 'org_structure', section: 'People & talent', text: 'How is the organization structured?', hint: 'Reporting lines, spans of control, gaps in leadership.' },
    { id: 'utilization', section: 'People & talent', text: 'What is the current utilization and bench? How are staffing decisions made?' },
    { id: 'key_person', section: 'People & talent', text: 'Where are the key-person dependencies?' },
    { id: 'attrition', section: 'People & talent', text: 'What has attrition looked like in the last 12 months, and why did people leave?' },
    { id: 'hiring', section: 'People & talent', text: 'What is the hiring plan, and which capability gaps does it need to close?' },
    { id: 'ai_adoption', section: 'People & talent', text: 'How are teams using AI in delivery today? What is blocking wider adoption?' },

    // Operations & finance
   // { id: 'pricing', section: 'Operations & finance', text: 'How is pricing set? What are the rate cards and margin targets?' },
   // { id: 'systems', section: 'Operations & finance', text: 'Which tools and systems run the business?', hint: 'PSA / time tracking, HR, finance, CRM, project management.' },
   // { id: 'reporting', section: 'Operations & finance', text: 'Which reports does leadership receive, and how often? Which decisions do they support?' },
   // { id: 'cash', section: 'Operations & finance', text: 'Are there any cash flow, invoicing or collections issues?' },

    // Wrap-up
   // { id: 'protect', section: 'Wrap-up', text: 'What is working well that we must protect?' },
   // { id: 'first_90', section: 'Wrap-up', text: 'What are the top 3 things to fix in the first 90 days?' },
    { id: 'other', section: 'Wrap-up', text: 'Other observations' }
  ],

  columns: {
    clients: [
      { key: 'client', label: 'Client', type: 'text', width: 180, placeholder: 'Client name' },
      { key: 'tier', label: 'Tier', type: 'select', width: 120, options: ['Strategic', 'Growth', 'Maintain'] },
      { key: 'grossMargin', label: 'Gross margin %', type: 'percent', width: 110, min: -100, max: 100 },
      {
        key: 'contractType', label: 'Contract type', type: 'select', width: 130,
        options: [{ value: 'FP', label: 'FP' }, { value: 'T&M', label: 'T&M' }, { value: 'Dedicated', label: 'Dedicated' }],
        help: 'FP = Fixed price, T&M = Time & materials'
      },
      { key: 'contractEnd', label: 'Contract end / renewal', type: 'date', width: 150 },
      { key: 'teamSize', label: 'Team size', type: 'number', width: 90, min: 0 },
      { key: 'projects', label: 'Projects', type: 'textarea', width: 200, placeholder: 'Comma-separated' },
      { key: 'stakeholders', label: 'Client stakeholders known', type: 'textarea', width: 220 },
      { key: 'accountOwner', label: 'Our Account Owner', type: 'text', width: 160, suggest: 'dl-people' },
      { key: 'deliveryOwner', label: 'Delivery Owner', type: 'text', width: 160, suggest: 'dl-people' },
      {
        key: 'health', label: 'Health (G/A/R)', type: 'select', width: 110,
        options: [
          { value: 'G', label: 'Green', tone: 'good' },
          { value: 'A', label: 'Amber', tone: 'warn' },
          { value: 'R', label: 'Red', tone: 'bad' }
        ]
      },
      { key: 'csat', label: 'CSAT / last feedback', type: 'textarea', width: 220 },
      { key: 'escalations', label: 'Open escalations', type: 'textarea', width: 220 },
      { key: 'growth', label: 'Growth opportunities', type: 'textarea', width: 220 },
      { key: 'risks', label: 'Key risks', type: 'textarea', width: 220 }
    ],

    team: [
      { key: 'name', label: 'Name', type: 'text', width: 170, placeholder: 'Full name' },
      { key: 'manager', label: 'Manager / Lead', type: 'text', width: 160, suggest: 'dl-people' },
      { key: 'location', label: 'Location', type: 'text', width: 130, suggest: 'dl-locations' },
      { key: 'role', label: 'Role', type: 'text', width: 160, suggest: 'dl-roles' },
      { key: 'primarySkill', label: 'Primary skill', type: 'text', width: 150, suggest: 'dl-skills' },
      { key: 'secondarySkills', label: 'Secondary skills', type: 'textarea', width: 200 },
      {
        key: 'aiFluency', label: 'AI Fluency', type: 'select', width: 140,
        options: [
          { value: '1', label: '1 – None' },
          { value: '2', label: '2 – Basic' },
          { value: '3', label: '3 – Proficient' },
          { value: '4', label: '4 – Advanced' },
          { value: '5', label: '5 – Expert' }
        ],
        help: '1 None · 2 Basic (occasional chat use) · 3 Proficient (daily in workflow) · 4 Advanced (builds AI-assisted workflows) · 5 Expert (leads and teaches others)'
      },
      { key: 'yearsExp', label: 'Years exp', type: 'number', width: 90, min: 0, step: 0.5 },
      { key: 'tenure', label: 'Tenure @Circulants (yrs)', type: 'number', width: 110, min: 0, step: 0.1 },
      { key: 'currentProject', label: 'Current project', type: 'text', width: 170, suggest: 'dl-projects' },
      { key: 'allocation', label: 'Allocation %', type: 'percent', width: 100, min: 0, max: 100 },
      {
        key: 'billable', label: 'Billable?', type: 'select', width: 100,
        options: [
          { value: 'Yes', label: 'Yes', tone: 'good' },
          { value: 'Partial', label: 'Partial', tone: 'warn' },
          { value: 'No', label: 'No', tone: 'bad' }
        ]
      },
      { key: 'rollOff', label: 'Roll-off date', type: 'date', width: 140 },
      { key: 'costRate', label: 'Cost rate / month', type: 'currency', width: 130, min: 0 },
      {
        key: 'flightRisk', label: 'Flight risk (H/M/L)', type: 'select', width: 110,
        options: [
          { value: 'H', label: 'High', tone: 'bad' },
          { value: 'M', label: 'Medium', tone: 'warn' },
          { value: 'L', label: 'Low', tone: 'good' }
        ]
      },
      { key: 'notes', label: 'Notes', type: 'textarea', width: 240 }
    ]
  }
};
