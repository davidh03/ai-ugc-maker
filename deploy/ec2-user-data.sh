#!/bin/bash
# EC2 user-data for the ai-ugc-maker production instance (Ubuntu 22.04).
# Bootstraps everything deploy.yml assumes is already there — Docker,
# AWS CLI, swap, CloudWatch agent, and the initial git checkout.
#
# This is exactly what provisioned the running instance; kept here so a
# replacement instance (recovery, or reprovisioning at a different size)
# starts from the same known-working script instead of re-deriving it.
set -euxo pipefail
exec > >(tee /var/log/ai-ugc-maker-bootstrap.log) 2>&1

# Docker via the official repo (Ubuntu's docker.io package doesn't bundle
# the `docker compose` plugin — learned the hard way in local testing).
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl gnupg unzip
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu || true

# deploy.yml runs `aws ecr get-login-password` ON the instance (via SSM) so
# the instance's own IAM role — not the GitHub runner's — authenticates the
# docker pull. Ubuntu's AMI doesn't ship the AWS CLI; found this the hard
# way when the first real deploy failed with "no basic auth credentials".
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
(cd /tmp && unzip -q awscliv2.zip && ./aws/install)

# 2GB RAM (t3.small) + swap absorbs a Chrome/FFmpeg memory spike instead of
# an OOM kill; low swappiness so it's a safety net, not the normal path.
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
sysctl -p /etc/sysctl.d/99-swappiness.conf

# CloudWatch agent — EC2 doesn't report memory/disk by default, only CPU/network.
curl -fsSL https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -o /tmp/cwagent.deb
dpkg -i /tmp/cwagent.deb || apt-get -f install -y
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWCONFIG'
{
  "metrics": {
    "namespace": "ai-ugc-maker",
    "append_dimensions": {"InstanceId": "${aws:InstanceId}"},
    "metrics_collected": {
      "mem": {"measurement": ["mem_used_percent"]},
      "disk": {"measurement": ["disk_used_percent"], "resources": ["/"]}
    }
  }
}
CWCONFIG
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

mkdir -p /opt/ai-ugc-maker
chown ubuntu:ubuntu /opt/ai-ugc-maker
# deploy.yml's SSM commands run as root (SSM RunShellScript's default), and
# do their own `git fetch && git reset --hard` before every deploy — this
# clone just needs to exist once so that has something to reset.
sudo -u ubuntu git clone --depth 1 https://github.com/davidh03/ai-ugc-maker.git /opt/ai-ugc-maker
# Without this, every future deploy's git command run as root against a
# clone owned by `ubuntu` fails: "detected dubious ownership in repository".
# --system (not --global) because SSM's root shell has no $HOME set.
git config --system --add safe.directory /opt/ai-ugc-maker
