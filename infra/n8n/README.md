# n8n server (Oracle Always Free)

Self-hosted n8n at **https://n8n.tallocpa.com**, receiving approved documents
from the client portal.

```
portal (Vercel) ──POST, x-tallocpa-secret──▶ https://n8n.tallocpa.com/webhook/tallocpa-intake
                                              │ Oracle Arm VM (Ubuntu 24.04)
                                              ├─ caddy     :80/:443  HTTPS, auto certificate
                                              ├─ n8n       :5678     internal only
                                              └─ postgres  :5432     internal only (n8n's own data)
```

Client tax data stays in Supabase. This Postgres holds only n8n's workflows,
credentials, and run history.

## 1. Oracle account (you, about 15 min)

1. <https://www.oracle.com/cloud/free> → **Start for free**. You need a real
   credit card (not prepaid or virtual) and a mobile number.
2. **Home region: Singapore (ap-singapore-1).** It's the closest to the
   Philippines and **can't be changed later**.
3. Stay on the free tier: **don't click Upgrade**. The $300 / 30-day trial
   expires on its own, and the Always Free resources stay.

### The idle rule on a free-only account

Oracle may reclaim an Always Free VM when, over 7 days, CPU (95th percentile),
network, **and** memory are all under 20%. A low-traffic n8n sits under all
three, so plan for it:

- **Use the 1 OCPU / 6 GB shape** (step 3). The memory threshold is then 1.2 GB
  instead of 2.4 GB, and Caddy + n8n + Postgres + Ubuntu use roughly 0.8–1.2 GB.
  That's close to the line, so it's not guaranteed. This shape also fits more
  often when Singapore is full.
- **Check weekly:** Compute → instance → **Metrics** → Memory utilization over
  7 days. If it's well under 20%, the VM is at risk.
- **If it gets reclaimed:** reports say Oracle stops the VM (it's not
  deleted), and you can start it again from the Console if capacity is
  available. While it's down, the portal keeps approved items under "Not sent to
  n8n" for Resend, so no data is lost.
- **Take a boot-volume backup** after setup (5 are free), so a rebuild takes
  minutes.
- **The way out is Pay As You Go.** Oracle's docs say Always Free resources
  stay free after upgrading. Upgrade when the risk stops being acceptable, and
  add a US$1 budget alert at the same time.

## 2. SSH key (on this PC)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oracle_n8n -C "tallocpa-n8n"
```

You'll upload `~/.ssh/oracle_n8n.pub` (the **.pub** file) in the next step. Never
share the private file `~/.ssh/oracle_n8n`.

## 3. Create the VM (you, about 10 min)

Console → **Compute → Instances → Create instance**:

| Setting | Value |
|---|---|
| Name | `tallocpa-n8n` |
| Image | Canonical **Ubuntu 24.04** (aarch64) |
| Shape | Ampere → **VM.Standard.A1.Flex**, **1 OCPU, 6 GB** (lower idle threshold; resize up to 2 / 12 later if needed) |
| Networking | Create new VCN, **assign a public IPv4** |
| SSH keys | **Upload public key** → `oracle_n8n.pub` |
| Boot volume | 100 GB |

Then open the cloud firewall: **Networking → Virtual cloud networks → your VCN →
Subnet → Security list → Add ingress rules**. Add source `0.0.0.0/0`, TCP, port
**80**, and the same again for port **443**. Don't open 5432 or 5678.

If you get "out of host capacity", retry at a quiet hour (early morning), try
another availability domain.

## 4. DNS (you)

Wherever tallocpa.com's DNS is managed, add an **A record**: name `n8n`, value
= the VM's public IP, TTL 300.

## 5. Install (Claude does this over SSH)

Give Claude the VM's public IP. Claude then:

```bash
scp -i ~/.ssh/oracle_n8n -r infra/n8n ubuntu@<IP>:~/n8n
ssh -i ~/.ssh/oracle_n8n ubuntu@<IP> 'bash ~/n8n/setup.sh'
```

`setup.sh` is safe to re-run. It:
- adds swap
- installs fail2ban, unattended-upgrades and Docker
- opens 80/443 in the VM's own firewall
- generates `.env` secrets
- starts the stack

**Back up `N8N_ENCRYPTION_KEY`** from `~/n8n/.env` into your password manager.
Without it, saved n8n credentials can't be decrypted after a rebuild.

## 6. Connect the portal (you, in n8n's UI)

1. Open https://n8n.tallocpa.com and create the **owner account** (strong password).
2. **Credentials → Add credential → Header Auth**: name `x-tallocpa-secret`,
   value = a long random string. Save it as "TalloCPA portal secret".
3. **Workflows → Import from file**, once for each file in `workflows/`:
   - `tallocpa-intake-router.json`: on the webhook node **and** the two HTTP
     nodes, select the "TalloCPA portal secret" credential. Then **Activate**.
   - `tallocpa-monthly-holds.json`: same credential on its two HTTP nodes, plus
     an **SMTP** credential on "Email the firm" (check the from/to addresses).
     Then **Activate**.
4. In the repo-root `.env` (and on Vercel):
   ```
   N8N_WEBHOOK_URL=https://n8n.tallocpa.com/webhook/tallocpa-intake
   N8N_WEBHOOK_SECRET=<the same random string>
   ```
   Set `PORTAL_URL` in `~/n8n/.env` on the server to the portal's address, then
   run `sudo docker compose up -d`.

What the workflows do (CLAUDE.md steps 1–5):

- **Intake router**
  - `document.uploaded` → the portal's AI parser → *Copy to Drive* → the
    **auto-clear rule** (AI says approve, not flagged, tax-valid, sales/
    purchases/expenses) → clear & post. Everything else stays in the portal's
    review bucket.
  - `item.posted` → the hook for the next stages (Manager.io push, tax
    computation).
  - The portal re-checks every auto-clear against the stored item, so editing
    the rule can't push a flagged document through.
- **Monthly holds** (1st, 6 AM Manila): releases holds whose month has arrived,
  runs them through the auto-clear rule, and emails a list of held purchases
  older than 30 days.
- **Copy to Drive** is a placeholder. It needs your Google login, so we build it
  together on the live server: `/{Client}/{Year}/Intake/`, then
  `POST /api/n8n/items/{id}` with `{"action":"drive","fileId":"…"}`.

## Keeping it healthy

- Weekly: Console → Compute → instance → **Metrics** (CPU and memory over 7 days).
- After setup, and after big changes: **Storage → Boot volumes → Create backup**
  (5 are free).
- Update n8n: `cd ~/n8n && sudo docker compose pull && sudo docker compose up -d`.
