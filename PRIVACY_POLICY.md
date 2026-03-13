# Privacy Policy for StepSnap

**Last Updated:** March 13, 2026

## Overview

StepSnap ("the Extension") is a browser extension designed to help users automatically generate step-by-step guides by recording their in-browser interactions.

We are committed to protecting your privacy. This Privacy Policy explains our practices regarding the collection, use, and disclosure of your information when you use the Extension. 

## Information We Collect

**We do not collect any personal data.** 

The Extension operates completely locally within your web browser. All recorded data, including:
* Clicks and interactions
* Typed text
* Scrolling activity
* Captured screenshots of active tabs

...is stored exclusively in your browser's local storage (`chrome.storage.local`). We do not have servers, and we do not transmit, upload, or share any of this data with ourselves or any third parties.

## How Your Information is Used

The data captured by the Extension is used solely for the purpose of generating a PDF guide containing your recorded steps and screenshots. Once the PDF is generated and downloaded, or if you clear the session manually, the recorded data is cleared from your local storage.

## Permissions

The Extension requires the following permissions to function correctly:
* `storage`: Used to temporarily store recording state and steps locally across page navigations.
* `activeTab` & `scripting`: Used to inject the script that listens for your clicks and keyboard inputs into the specific page you are recording. This enables the core functionality of tracking steps.
* `host_permissions` for `<all_urls>`: Required for `captureVisibleTab`, which allows the Extension to take screenshots of the page you are working on to include in your output PDF.
* `unlimitedStorage`: Used to ensure the Extension has enough local space to save screenshots before the PDF is compiled.

## Third-Party Services

We do not use any third-party analytics, trackers, or advertising services. 

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Your continued use of the Extension after any modifications indicates your acceptance of the updated Privacy Policy.

## Contact

If you have any questions or suggestions about our Privacy Policy, please feel free to contact us.
