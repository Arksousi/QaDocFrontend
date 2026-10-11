# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> Deployed app — read-only smoke >> filtering by state round-trips to the real API
- Location: e2e\smoke\production.spec.ts:127:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /^Open/ })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /^Open/ }) resolved to 2 elements:
    1) <button type="button" aria-pressed="true" class="state-chip active">…</button> aka getByRole('button', { name: 'Open 0' })
    2) <button type="button" aria-haspopup="true" aria-expanded="true" class="filter-button active">…</button> aka getByRole('button', { name: 'Open', exact: true })

Call log:
  - Expect "toBeVisible" getByRole('button', { name: /^Open/ }) with timeout 20000ms
  - waiting for getByRole('button', { name: /^Open/ })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - link "Q Desk home" [ref=e6] [cursor=pointer]:
        - /url: /
        - img "Q Desk" [ref=e7]
      - textbox "Search all projects" [ref=e9]:
        - /placeholder: Search tickets
      - button "Guest" [ref=e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=e14]: G
    - status [ref=e19]:
      - text: You're exploring
      - strong [ref=e20]: sample data
      - text: as a guest. Nothing here can be changed.
      - button "Sign in to your workspace" [ref=e21] [cursor=pointer]
  - main [ref=e22]:
    - generic [ref=e23]:
      - navigation "Folders" [ref=e24]:
        - heading "Folders" [level=2] [ref=e25]
        - searchbox "Search folders" [ref=e26]
        - button "All tickets 0/0" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: All tickets
          - generic "0 open of 0" [ref=e29]: 0/0
        - paragraph [ref=e30]: No folders match “”.
      - generic [ref=e31]:
        - group "Tickets by state" [ref=e32]:
          - button "Open 0" [pressed] [ref=e33] [cursor=pointer]:
            - generic [ref=e35]: Open
            - generic [ref=e36]: "0"
          - button "In Progress 0" [ref=e37] [cursor=pointer]:
            - generic [ref=e39]: In Progress
            - generic [ref=e40]: "0"
          - button "Resolved 0" [ref=e41] [cursor=pointer]:
            - generic [ref=e43]: Resolved
            - generic [ref=e44]: "0"
          - button "Retest 0" [ref=e45] [cursor=pointer]:
            - generic [ref=e47]: Retest
            - generic [ref=e48]: "0"
          - button "Closed 0" [ref=e49] [cursor=pointer]:
            - generic [ref=e51]: Closed
            - generic [ref=e52]: "0"
        - generic [ref=e53]:
          - searchbox "Search tickets" [ref=e55]
          - generic [ref=e56]:
            - button "Open" [expanded] [ref=e57] [cursor=pointer]
            - group "Filter by state" [ref=e63]:
              - generic [ref=e64] [cursor=pointer]:
                - checkbox "Open" [checked] [active] [ref=e65]
                - generic [ref=e68]: Open
              - generic [ref=e69] [cursor=pointer]:
                - checkbox "In Progress" [ref=e70]
                - generic [ref=e73]: In Progress
              - generic [ref=e74] [cursor=pointer]:
                - checkbox "Resolved" [ref=e75]
                - generic [ref=e78]: Resolved
              - generic [ref=e79] [cursor=pointer]:
                - checkbox "Retest" [ref=e80]
                - generic [ref=e83]: Retest
              - generic [ref=e84] [cursor=pointer]:
                - checkbox "Closed" [ref=e85]
                - generic [ref=e88]: Closed
              - button "Clear" [ref=e89] [cursor=pointer]
          - button "All types" [ref=e91] [cursor=pointer]
          - button "All tags" [ref=e98] [cursor=pointer]
          - generic [ref=e104] [cursor=pointer]:
            - checkbox "Assigned to me" [ref=e105]
            - text: Assigned to me
          - button "Clear filters" [ref=e106] [cursor=pointer]
          - generic [ref=e107]: 0 tickets
        - table [ref=e109]:
          - rowgroup [ref=e110]:
            - row [ref=e111]:
              - cell [ref=e112]
              - cell [ref=e114]
              - cell [ref=e116]
              - cell [ref=e118]
              - cell [ref=e120]
              - cell [ref=e122]
            - row [ref=e124]:
              - cell [ref=e125]
              - cell [ref=e127]
              - cell [ref=e129]
              - cell [ref=e131]
              - cell [ref=e133]
              - cell [ref=e135]
            - row [ref=e137]:
              - cell [ref=e138]
              - cell [ref=e140]
              - cell [ref=e142]
              - cell [ref=e144]
              - cell [ref=e146]
              - cell [ref=e148]
            - row [ref=e150]:
              - cell [ref=e151]
              - cell [ref=e153]
              - cell [ref=e155]
              - cell [ref=e157]
              - cell [ref=e159]
              - cell [ref=e161]
            - row [ref=e163]:
              - cell [ref=e164]
              - cell [ref=e166]
              - cell [ref=e168]
              - cell [ref=e170]
              - cell [ref=e172]
              - cell [ref=e174]
            - row [ref=e176]:
              - cell [ref=e177]
              - cell [ref=e179]
              - cell [ref=e181]
              - cell [ref=e183]
              - cell [ref=e185]
              - cell [ref=e187]
            - row [ref=e189]:
              - cell [ref=e190]
              - cell [ref=e192]
              - cell [ref=e194]
              - cell [ref=e196]
              - cell [ref=e198]
              - cell [ref=e200]
            - row [ref=e202]:
              - cell [ref=e203]
              - cell [ref=e205]
              - cell [ref=e207]
              - cell [ref=e209]
              - cell [ref=e211]
              - cell [ref=e213]
        - status [ref=e215]: Loading tickets…
```

# Test source

```ts
  46  |  * Opens the first project from the "All projects" table.
  47  |  *
  48  |  * Clicks the project-name link rather than the row: a row click lands on whatever cell
  49  |  * sits at its centre, and the actions cell stops propagation, so the link is the only
  50  |  * deterministic target. Both routes reach the same place.
  51  |  */
  52  | async function signInAsGuest(page: Page) {
  53  |   await page.goto('/login');
  54  |   await page.getByRole('button', { name: 'Continue as a guest' }).click();
  55  |   await expect(page).toHaveURL(/\/home$/);
  56  |   await page.getByRole('link', { name: 'Open Q Desk, the ticket tracker' }).click();
  57  |   await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
  58  | }
  59  | 
  60  | /**
  61  |  * Opens the first project from the "All projects" table.
  62  |  *
  63  |  * Clicks the project-name link rather than the row: a row click lands on whatever cell
  64  |  * sits at its centre, and the actions cell stops propagation, so the link is the only
  65  |  * deterministic target. Both routes reach the same place.
  66  |  */
  67  | async function openFirstProject(page: Page) {
  68  |   await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible();
  69  |   await page.locator('table.table tbody tr').first().getByRole('link').first().click();
  70  | }
  71  | 
  72  | test.describe('Deployed app — read-only smoke', () => {
  73  |   test('the app boots and serves the sign-in page', async ({ page }) => {
  74  |     await blockWrites(page);
  75  | 
  76  |     const response = await page.goto('/');
  77  |     expect(response?.status(), 'the Worker should serve the app').toBeLessThan(400);
  78  | 
  79  |     // Signed out, authGuard bounces every route to /login.
  80  |     await expect(page).toHaveURL(/\/login/);
  81  |     await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  82  |     await expect(page.getByRole('button', { name: 'Continue as a guest' })).toBeEnabled();
  83  |   });
  84  | 
  85  |   test('the API is reachable and answers the setup check', async ({ page }) => {
  86  |     await blockWrites(page);
  87  | 
  88  |     // If Railway is asleep or down, this is the request that shows it — and it is the
  89  |     // one the login page blocks on, so a failure here explains a permanent "Loading…".
  90  |     const status = page.waitForResponse(
  91  |       (r) => r.url().includes('/auth/status') && r.request().method() === 'GET',
  92  |     );
  93  |     await page.goto('/login');
  94  | 
  95  |     expect((await status).status()).toBe(200);
  96  |     await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  97  |   });
  98  | 
  99  |   test('the guest tour opens and lists sample projects', async ({ page }) => {
  100 |     const guard = await blockWrites(page);
  101 | 
  102 |     await signInAsGuest(page);
  103 | 
  104 |     // Shape, not count: at least one project, whatever the tour holds today.
  105 |     const rows = page.locator('table.table tbody tr');
  106 |     expect(await rows.count()).toBeGreaterThan(0);
  107 | 
  108 |     expect(guard.attempted, 'no writes should have been attempted').toEqual([]);
  109 |   });
  110 | 
  111 |   test('a guest can open a project and see its ticket list', async ({ page }) => {
  112 |     const guard = await blockWrites(page);
  113 | 
  114 |     await signInAsGuest(page);
  115 | 
  116 |     await openFirstProject(page);
  117 | 
  118 |     // The toolbar is the proof the Ticket Viewer rendered, not just that routing fired.
  119 |     await expect(page.getByLabel('Search tickets')).toBeVisible();
  120 |     await expect(page.getByRole('button', { name: /All states/ })).toBeVisible();
  121 |     await expect(page.getByRole('button', { name: /All types/ })).toBeVisible();
  122 |     await expect(page.getByRole('button', { name: /All tags/ })).toBeVisible();
  123 | 
  124 |     expect(guard.attempted).toEqual([]);
  125 |   });
  126 | 
  127 |   test('filtering by state round-trips to the real API', async ({ page }) => {
  128 |     const guard = await blockWrites(page);
  129 | 
  130 |     await signInAsGuest(page);
  131 |     await openFirstProject(page);
  132 |     await expect(page.getByLabel('Search tickets')).toBeVisible();
  133 | 
  134 |     // Catch the request the filter causes, and check the query the UI built.
  135 |     const request = page.waitForRequest(
  136 |       (r) => r.url().includes('/tickets') && r.url().includes('state=Open'),
  137 |     );
  138 | 
  139 |     await page.getByRole('button', { name: /All states/ }).click();
  140 |     await page.getByRole('checkbox', { name: 'Open' }).check();
  141 | 
  142 |     const url = new URL((await request).url());
  143 |     expect(url.searchParams.getAll('state')).toEqual(['Open']);
  144 | 
  145 |     // Whatever came back, every visible row should now be Open.
> 146 |     await expect(page.getByRole('button', { name: /^Open/ })).toBeVisible();
      |                                                               ^ Error: expect(locator).toBeVisible() failed
  147 |     const states = page.locator('table.table tbody tr .state');
  148 |     for (let i = 0; i < (await states.count()); i++) {
  149 |       await expect(states.nth(i)).toHaveText('Open');
  150 |     }
  151 | 
  152 |     expect(guard.attempted).toEqual([]);
  153 |   });
  154 | 
  155 |   test('a guest cannot see the create-ticket button', async ({ page }) => {
  156 |     const guard = await blockWrites(page);
  157 | 
  158 |     await signInAsGuest(page);
  159 |     await openFirstProject(page);
  160 |     await expect(page.getByLabel('Search tickets')).toBeVisible();
  161 | 
  162 |     // The UI hides what the API would refuse. This checks the courtesy half; the API
  163 |     // half is enforced server-side by GuestReadOnlyFilter and is not tested here.
  164 |     //
  165 |     // The name is "Create ticket", NOT "+ Create ticket": the leading glyph is now an
  166 |     // <app-icon>, which contributes nothing to the accessible name. A toHaveCount(0)
  167 |     // written against the old string passes whether the button is there or not.
  168 |     await expect(page.getByRole('button', { name: 'Create ticket' })).toHaveCount(0);
  169 | 
  170 |     expect(guard.attempted).toEqual([]);
  171 |   });
  172 | 
  173 |   test('no console errors on the main journey', async ({ page }) => {
  174 |     await blockWrites(page);
  175 | 
  176 |     const errors: string[] = [];
  177 |     page.on('console', (message) => {
  178 |       if (message.type() === 'error') errors.push(message.text());
  179 |     });
  180 |     page.on('pageerror', (error) => errors.push(String(error)));
  181 | 
  182 |     await signInAsGuest(page);
  183 |     await openFirstProject(page);
  184 |     await expect(page.getByLabel('Search tickets')).toBeVisible();
  185 | 
  186 |     expect(errors, 'the deployed app should log no console errors').toEqual([]);
  187 |   });
  188 | });
  189 | 
```