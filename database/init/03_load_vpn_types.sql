-- Load VPN Types from CSV
INSERT INTO VpnTypes (VpnTypeID, VpnTypeName) VALUES
(1, 'METRO'),
(2, 'GSM')
ON CONFLICT (VpnTypeName) DO NOTHING;
