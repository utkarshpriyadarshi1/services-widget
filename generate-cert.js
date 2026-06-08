const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function generateCert() {
  const packageJsonPath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error('package.json not found');
    process.exit(1);
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse package.json:', err.message);
    process.exit(1);
  }

  const winConfig = (pkg.build && pkg.build.win) || {};
  
  const certFile = winConfig.certificateFile || 'certs/certificate.pfx';
  const certPass = winConfig.certificatePassword || 'servicepulse123';
  const publisherName = winConfig.publisherName || 'Utkarsh Priyadarshi';

  const absoluteCertPath = path.resolve(__dirname, certFile);
  const certDir = path.dirname(absoluteCertPath);

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  // Check if cert already exists
  if (fs.existsSync(absoluteCertPath)) {
    console.log(`Certificate already exists at: ${absoluteCertPath}`);
    return;
  }

  console.log(`Generating code signing certificate for CN="${publisherName}" at: ${absoluteCertPath}...`);

  // We write a temporary ps1 script to avoid PowerShell command line escaping complexities
  const tempScriptPath = path.join(__dirname, 'temp-gen-cert.ps1');
  
  // Format the certificate path for PowerShell by escaping single quotes and backslashes
  const psCertPath = absoluteCertPath.replace(/'/g, "''").replace(/\\/g, '\\\\');
  const psCertPass = certPass.replace(/'/g, "''");
  const psPublisher = publisherName.replace(/'/g, "''");

  const psScript = `
$ErrorActionPreference = 'Stop'
try {
    $password = ConvertTo-SecureString '${psCertPass}' -AsPlainText -Force
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=${psPublisher}" -KeyUsage DigitalSignature -FriendlyName "ServicePulse Developer Certificate" -NotAfter (Get-Date).AddYears(5)
    Export-PfxCertificate -Cert $cert -FilePath "${psCertPath}" -Password $password
    
    # Clean up local personal store to prevent cluttering
    Remove-Item "Cert:\\CurrentUser\\My\\$($cert.Thumbprint)" -Force -ErrorAction SilentlyContinue
    Remove-Item "Cert:\\LocalMachine\\My\\$($cert.Thumbprint)" -Force -ErrorAction SilentlyContinue
    
    Write-Output "Successfully generated certificate."
} catch {
    Write-Error $_
    exit 1
}
`;

  fs.writeFileSync(tempScriptPath, psScript, 'utf8');

  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, { stdio: 'inherit' });
    console.log('Certificate generated successfully.');
  } catch (err) {
    console.error('Failed to generate certificate:', err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (unlinkErr) {
        console.warn('Failed to clean up temporary script:', unlinkErr.message);
      }
    }
  }
}

generateCert();
