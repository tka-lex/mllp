# MLLP Release Notes

# v3.0.0

- Full ESM Module Support
- TypeScript SourceMaps
-

# v2.1.4

- Encoding Support
- MultiMessages per Connection

# v1.0.0 - December 12, 2014

This is the initial release of this library.

- Basic listener server compliant with HL7's MLLP standard
- Sends AA acknowledgement
- Access to HL7 messages/data via EventEmitter

# v2.0.0 - September 25 , 2018

- Set minimum node version to be 8
- Large message support

# v2.1.1 - Juli 24 , 2023

- added Socket-Termination on server.close()
- Switched to eslint & prettier and Updated code accordingly
- updated dependencies

# v2.1.2 - Juli 24 , 2023

- switched to @sourceblock-ug/sb-sl7, Version 2.0.17; added cleanup on handleAck();
- added default Response as Param to Constructor

# v2.1.3 - Mar 28 , 2024

- fixed a Bug with the Buffer handling on parallel Socket-Connections
