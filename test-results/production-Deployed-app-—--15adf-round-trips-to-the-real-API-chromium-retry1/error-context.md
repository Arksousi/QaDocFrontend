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
      - link "Projects" [ref=e10] [cursor=pointer]:
        - /url: /
      - button "Guest" [ref=e17] [cursor=pointer]:
        - generic [aria-hidden] [ref=e19]: G
    - status [ref=e24]:
      - text: You're exploring
      - strong [ref=e25]: sample data
      - text: as a guest. Nothing here can be changed.
      - button "Sign in to your workspace" [ref=e26] [cursor=pointer]
  - main [ref=e27]:
    - generic [ref=e28]:
      - generic [ref=e29]: CLS
      - generic [ref=e30]:
        - heading "Clinic Scheduler" [level=1] [ref=e31]
        - paragraph [ref=e32]:
          - strong [ref=e33]: "9"
          - text: open · 11 total ·
          - img "18% of tickets closed" [ref=e34]: 18% done
    - generic [ref=e37]:
      - navigation "Folders" [ref=e38]:
        - heading "Folders" [level=2] [ref=e39]
        - searchbox "Search folders" [ref=e40]
        - button "All tickets 9/11" [ref=e41] [cursor=pointer]:
          - generic [ref=e42]: All tickets
          - generic "9 open of 11" [ref=e43]: 9/11
        - button "GEN General 1/1" [ref=e45] [cursor=pointer]:
          - generic [ref=e46]: GEN
          - generic [ref=e47]: General
          - generic "1 open of 1" [ref=e48]: 1/1
        - button "REM Reminders 3/5" [ref=e50] [cursor=pointer]:
          - generic [ref=e51]: REM
          - generic [ref=e52]: Reminders
          - generic "3 open of 5" [ref=e53]: 3/5
        - button "V1 Version 1 5/5" [ref=e55] [cursor=pointer]:
          - generic [ref=e56]: V1
          - generic [ref=e57]: Version 1
          - generic "5 open of 5" [ref=e58]: 5/5
      - generic [ref=e59]:
        - group "Tickets by state" [ref=e60]:
          - button "Open 3" [pressed] [ref=e61] [cursor=pointer]:
            - generic [ref=e63]: Open
            - generic [ref=e64]: "3"
          - button "In Progress 2" [ref=e65] [cursor=pointer]:
            - generic [ref=e67]: In Progress
            - generic [ref=e68]: "2"
          - button "Resolved 2" [ref=e69] [cursor=pointer]:
            - generic [ref=e71]: Resolved
            - generic [ref=e72]: "2"
          - button "Retest 2" [ref=e73] [cursor=pointer]:
            - generic [ref=e75]: Retest
            - generic [ref=e76]: "2"
          - button "Closed 2" [ref=e77] [cursor=pointer]:
            - generic [ref=e79]: Closed
            - generic [ref=e80]: "2"
        - generic [ref=e81]:
          - searchbox "Search tickets" [ref=e83]
          - generic [ref=e84]:
            - button "Open" [expanded] [ref=e85] [cursor=pointer]
            - group "Filter by state" [ref=e91]:
              - generic [ref=e92] [cursor=pointer]:
                - checkbox "Open" [checked] [active] [ref=e93]
                - generic [ref=e96]: Open
              - generic [ref=e97] [cursor=pointer]:
                - checkbox "In Progress" [ref=e98]
                - generic [ref=e101]: In Progress
              - generic [ref=e102] [cursor=pointer]:
                - checkbox "Resolved" [ref=e103]
                - generic [ref=e106]: Resolved
              - generic [ref=e107] [cursor=pointer]:
                - checkbox "Retest" [ref=e108]
                - generic [ref=e111]: Retest
              - generic [ref=e112] [cursor=pointer]:
                - checkbox "Closed" [ref=e113]
                - generic [ref=e116]: Closed
              - button "Clear" [ref=e117] [cursor=pointer]
          - button "All types" [ref=e119] [cursor=pointer]
          - button "All tags" [ref=e126] [cursor=pointer]
          - generic [ref=e132] [cursor=pointer]:
            - checkbox "Assigned to me" [ref=e133]
            - text: Assigned to me
          - button "Clear filters" [ref=e134] [cursor=pointer]
          - generic [ref=e135]: 11 tickets
        - table [ref=e137]:
          - rowgroup [ref=e138]:
            - row [ref=e139]:
              - columnheader [ref=e140]:
                - button "Type" [ref=e141] [cursor=pointer]
              - columnheader [ref=e143]:
                - button "ID" [ref=e144] [cursor=pointer]
              - columnheader [ref=e146]:
                - button "Title" [ref=e147] [cursor=pointer]
              - columnheader [ref=e149]:
                - button "Priority" [ref=e150] [cursor=pointer]
              - columnheader [ref=e152]:
                - button "Assigned To" [ref=e153] [cursor=pointer]
              - columnheader [ref=e155]:
                - button "State" [ref=e156] [cursor=pointer]
              - columnheader [ref=e158]:
                - button "Tag" [ref=e159] [cursor=pointer]
              - columnheader [ref=e161]:
                - button [ref=e162] [cursor=pointer]
          - rowgroup [ref=e167]:
            - row [ref=e168] [cursor=pointer]:
              - cell [ref=e169]:
                - generic "Bug" [ref=e170]:
                  - img "Bug" [ref=e172]
              - cell [ref=e177]:
                - link "CLS-GEN-0001" [ref=e178]:
                  - /url: /projects/11?ticket=106
              - cell "gfgh" [ref=e179]
              - cell [ref=e180]:
                - generic "Priority 3 · Medium" [ref=e181]: "3"
              - cell "hachem" [ref=e185]:
                - generic "hachem" [ref=e186]:
                  - generic [aria-hidden] [ref=e188]: H
              - cell "Open" [ref=e190]
              - cell "appointments" [ref=e192]
              - cell "20 Sep, 10:13 AM" [ref=e195]
            - row [ref=e196] [cursor=pointer]:
              - cell [ref=e197]:
                - generic "Bug" [ref=e198]:
                  - img "Bug" [ref=e200]
              - cell [ref=e205]:
                - link "CLS-REM-0005" [ref=e206]:
                  - /url: /projects/11?ticket=95
              - cell [ref=e207]:
                - text: Time zone of the clinic ignored for remote staff
                - generic "1 comment(s)" [ref=e208]: "1"
              - cell [ref=e212]:
                - generic "Priority 2 · High" [ref=e213]: "2"
              - cell "Unassigned" [ref=e217]
              - cell "Closed" [ref=e218]
              - cell "patients sms" [ref=e220]:
                - generic [ref=e221]:
                  - generic [ref=e222]: patients
                  - generic [ref=e223]: sms
              - cell "20 Sep, 10:07 AM" [ref=e224]
            - row [ref=e225] [cursor=pointer]:
              - cell [ref=e226]:
                - generic "Bug" [ref=e227]:
                  - img "Bug" [ref=e229]
              - cell [ref=e234]:
                - link "CLS-V1-0005" [ref=e235]:
                  - /url: /projects/11?ticket=94
              - cell "Recurring appointments stop after ten occurrences" [ref=e236]
              - cell [ref=e237]:
                - generic "Priority 1 · Highest" [ref=e238]: "1"
              - cell "Qutaiba" [ref=e242]:
                - generic "Qutaiba" [ref=e243]:
                  - generic [aria-hidden] [ref=e245]: Q
              - cell "Retest" [ref=e247]
              - cell "appointments calendar" [ref=e249]:
                - generic [ref=e250]:
                  - generic [ref=e251]: appointments
                  - generic [ref=e252]: calendar
              - cell "20 Sep, 10:07 AM" [ref=e253]
            - row [ref=e254] [cursor=pointer]:
              - cell [ref=e255]:
                - generic "Enhancement" [ref=e256]:
                  - img "Enhancement" [ref=e258]
              - cell [ref=e262]:
                - link "CLS-REM-0004" [ref=e263]:
                  - /url: /projects/11?ticket=93
              - cell "Calendar prints without the patient names" [ref=e264]
              - cell [ref=e265]:
                - generic "Priority 4 · Low" [ref=e266]: "4"
              - cell "Non Accessed User" [ref=e270]:
                - generic "Non Accessed User" [ref=e271]:
                  - generic [aria-hidden] [ref=e273]: NA
              - cell "Resolved" [ref=e275]
              - cell "patients sms" [ref=e277]:
                - generic [ref=e278]:
                  - generic [ref=e279]: patients
                  - generic [ref=e280]: sms
              - cell "20 Sep, 10:07 AM" [ref=e281]
            - row [ref=e282] [cursor=pointer]:
              - cell [ref=e283]:
                - generic "Bug" [ref=e284]:
                  - img "Bug" [ref=e286]
              - cell [ref=e291]:
                - link "CLS-V1-0004" [ref=e292]:
                  - /url: /projects/11?ticket=92
              - cell [ref=e293]:
                - text: Appointment length ignores the procedure type
                - generic "1 comment(s)" [ref=e294]: "1"
              - cell [ref=e298]:
                - generic "Priority 3 · Medium" [ref=e299]: "3"
              - cell "Mohammad Noureddine" [ref=e303]:
                - generic "Mohammad Noureddine" [ref=e304]:
                  - generic [aria-hidden] [ref=e306]: MN
              - cell "In Progress" [ref=e308]
              - cell "appointments calendar" [ref=e310]:
                - generic [ref=e311]:
                  - generic [ref=e312]: appointments
                  - generic [ref=e313]: calendar
              - cell "20 Sep, 10:07 AM" [ref=e314]
            - row [ref=e315] [cursor=pointer]:
              - cell [ref=e316]:
                - generic "Bug" [ref=e317]:
                  - img "Bug" [ref=e319]
              - cell [ref=e324]:
                - link "CLS-REM-0003" [ref=e325]:
                  - /url: /projects/11?ticket=91
              - cell "Waiting list does not offer freed slots" [ref=e326]
              - cell [ref=e327]:
                - generic "Priority 2 · High" [ref=e328]: "2"
              - cell "hachem" [ref=e332]:
                - generic "hachem" [ref=e333]:
                  - generic [aria-hidden] [ref=e335]: H
              - cell "Open" [ref=e337]
              - cell "patients sms" [ref=e339]:
                - generic [ref=e340]:
                  - generic [ref=e341]: patients
                  - generic [ref=e342]: sms
              - cell "20 Sep, 10:07 AM" [ref=e343]
            - row [ref=e344] [cursor=pointer]:
              - cell [ref=e345]:
                - generic "Bug" [ref=e346]:
                  - img "Bug" [ref=e348]
              - cell [ref=e353]:
                - link "CLS-V1-0003" [ref=e354]:
                  - /url: /projects/11?ticket=90
              - cell "Patient search matches on partial phone numbers only" [ref=e355]
              - cell [ref=e356]:
                - generic "Priority 1 · Highest" [ref=e357]: "1"
              - cell "Unassigned" [ref=e361]
              - cell "Open" [ref=e362]
              - cell "appointments calendar" [ref=e364]:
                - generic [ref=e365]:
                  - generic [ref=e366]: appointments
                  - generic [ref=e367]: calendar
              - cell "20 Sep, 10:07 AM" [ref=e368]
            - row [ref=e369] [cursor=pointer]:
              - cell [ref=e370]:
                - generic "Bug" [ref=e371]:
                  - img "Bug" [ref=e373]
              - cell [ref=e378]:
                - link "CLS-REM-0002" [ref=e379]:
                  - /url: /projects/11?ticket=89
              - cell [ref=e380]:
                - text: Doctor holiday does not remove existing appointments
                - generic "1 comment(s)" [ref=e381]: "1"
              - cell [ref=e385]:
                - generic "Priority 4 · Low" [ref=e386]: "4"
              - cell "Unassigned" [ref=e390]
              - cell "Closed" [ref=e391]
              - cell "patients sms" [ref=e393]:
                - generic [ref=e394]:
                  - generic [ref=e395]: patients
                  - generic [ref=e396]: sms
              - cell "20 Sep, 10:07 AM" [ref=e397]
            - row [ref=e398] [cursor=pointer]:
              - cell [ref=e399]:
                - generic "Enhancement" [ref=e400]:
                  - img "Enhancement" [ref=e402]
              - cell [ref=e406]:
                - link "CLS-V1-0002" [ref=e407]:
                  - /url: /projects/11?ticket=88
              - cell "Cancelled appointments still block the slot" [ref=e408]
              - cell [ref=e409]:
                - generic "Priority 3 · Medium" [ref=e410]: "3"
              - cell "Qutaiba" [ref=e414]:
                - generic "Qutaiba" [ref=e415]:
                  - generic [aria-hidden] [ref=e417]: Q
              - cell "Retest" [ref=e419]
              - cell "appointments calendar" [ref=e421]:
                - generic [ref=e422]:
                  - generic [ref=e423]: appointments
                  - generic [ref=e424]: calendar
              - cell "20 Sep, 10:07 AM" [ref=e425]
            - row [ref=e426] [cursor=pointer]:
              - cell [ref=e427]:
                - generic "Bug" [ref=e428]:
                  - img "Bug" [ref=e430]
              - cell [ref=e435]:
                - link "CLS-REM-0001" [ref=e436]:
                  - /url: /projects/11?ticket=87
              - cell "SMS reminder sends at 3am for next-day appointments" [ref=e437]
              - cell [ref=e438]:
                - generic "Priority 2 · High" [ref=e439]: "2"
              - cell "Non Accessed User" [ref=e443]:
                - generic "Non Accessed User" [ref=e444]:
                  - generic [aria-hidden] [ref=e446]: NA
              - cell "Resolved" [ref=e448]
              - cell "patients sms" [ref=e450]:
                - generic [ref=e451]:
                  - generic [ref=e452]: patients
                  - generic [ref=e453]: sms
              - cell "20 Sep, 10:07 AM" [ref=e454]
            - row [ref=e455] [cursor=pointer]:
              - cell [ref=e456]:
                - generic "Bug" [ref=e457]:
                  - img "Bug" [ref=e459]
              - cell [ref=e464]:
                - link "CLS-V1-0001" [ref=e465]:
                  - /url: /projects/11?ticket=86
              - cell [ref=e466]:
                - text: Double-booked slot when two receptionists book together
                - generic "1 comment(s)" [ref=e467]: "1"
              - cell [ref=e471]:
                - generic "Priority 1 · Highest" [ref=e472]: "1"
              - cell "Mohammad Noureddine" [ref=e476]:
                - generic "Mohammad Noureddine" [ref=e477]:
                  - generic [aria-hidden] [ref=e479]: MN
              - cell "In Progress" [ref=e481]
              - cell "appointments calendar" [ref=e483]:
                - generic [ref=e484]:
                  - generic [ref=e485]: appointments
                  - generic [ref=e486]: calendar
              - cell "20 Sep, 10:07 AM" [ref=e487]
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