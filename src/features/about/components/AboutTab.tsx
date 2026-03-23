// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

'use client'

import { APP_VERSION, APP_DESCRIPTION } from '@/shared/constants'

// Helper component for trademark formatting (® never bold)
function TrademarkedName({ name, bold = false }: { name: string; bold?: boolean }) {
  return (
    <span>
      {bold ? <strong>{name}</strong> : name}<span className="font-normal">&reg;</span>
    </span>
  )
}

export function AboutTab() {
  return (
    <div className="max-w-[800px]">
      <h2 className="text-2xl mb-2 text-spert-text">
        About <TrademarkedName name="SPERT" /> Forecaster
      </h2>
      <p className="text-spert-text-muted italic mb-8">{APP_DESCRIPTION}</p>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">
          What is <TrademarkedName name="SPERT" /> Forecaster?
        </h3>
        <p className="leading-relaxed text-spert-text-secondary">
          <TrademarkedName name="Statistical PERT" bold /> (<TrademarkedName name="SPERT" />) makes
          statistical modeling accessible to project managers, Scrum Masters, students,
          businesspeople, and others who need to model uncertain outcomes using a lightweight,
          highly accessible approach. PERT stands for Program Evaluation and Review Technique,
          a classic project management technique to model project uncertainties, like project
          duration and budget. Statistical PERT (SPERT) is a modern approach to estimating
          project uncertainties using a variety of statistical probability distributions, Monte
          Carlo simulation, and unique approaches that operate with subjective expert judgement
          or historical data (when it&apos;s available).
        </p>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">How It Works</h3>
        <ul className="pl-8 leading-loose text-spert-text-secondary list-disc">
          <li>Create a project with your sprint cadence</li>
          <li>Record your sprint history with &quot;done&quot; values</li>
          <li>Enter your remaining backlog size</li>
          <li>Run a Monte Carlo simulation to get probabilistic finish dates</li>
        </ul>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">About the Simulation</h3>
        <p className="leading-relaxed text-spert-text-secondary">
          The forecast runs thousands of Monte Carlo trials using multiple probability distributions
          (Truncated Normal, Lognormal, Gamma, Bootstrap, Triangular, and Uniform). Each trial
          simulates completing the remaining backlog by drawing random velocities for each sprint
          until the work is done. The percentile results show the likelihood of finishing by each date.
        </p>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">Quick Reference Guide</h3>
        <p className="leading-relaxed text-spert-text-secondary mb-3">
          View the printable quick reference guide for a concise overview of all features,
          workflow steps, and key concepts.
        </p>
        <a
          href="/SPERTForecaster_Quick_Reference_Guide.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-spert-blue text-white no-underline rounded font-semibold mt-2"
        >
          Open Quick Reference Guide (PDF)
        </a>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">Your Data &amp; Storage</h3>
        <p className="leading-relaxed text-spert-text-secondary mb-4">
          SPERT Forecaster offers two storage modes, configurable in <strong>Settings</strong>.
        </p>

        <h4 className="text-lg mb-2 text-spert-text font-semibold">Local Storage (Default)</h4>
        <ul className="pl-8 leading-loose text-spert-text-secondary list-disc mb-4">
          <li>Data is stored in your browser&apos;s localStorage and <strong>never leaves your device</strong></li>
          <li>No external database servers, no third-party access, no data governance concerns</li>
          <li>Ideal for corporate/organizational environments where data must stay within your network</li>
          <li>Use <strong>Export</strong> to back up your data as a JSON file; use <strong>Import</strong> to restore or transfer between browsers</li>
          <li><strong>Note:</strong> Clearing your browser cache/data will delete all stored projects and sprints unless you&apos;ve exported a backup</li>
        </ul>

        <h4 className="text-lg mb-2 text-spert-text font-semibold">Cloud Storage (Optional)</h4>
        <ul className="pl-8 leading-loose text-spert-text-secondary list-disc">
          <li>Sign in with <strong>Google</strong> or <strong>Microsoft</strong> to sync your data across devices</li>
          <li>Data is stored in Google Firebase/Firestore, encrypted in transit (TLS) and at rest</li>
          <li>Share projects with team members as <strong>editors</strong> or <strong>viewers</strong></li>
          <li>Switching to cloud mode will prompt you to upload your existing local data</li>
        </ul>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">Author &amp; Source Code</h3>
        <p className="leading-relaxed text-spert-text-secondary mb-2">
          Created by <strong>William W. Davis, MSPM, PMP</strong>
        </p>
        <a
          href="https://github.com/famousdavis/spert-forecaster"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-spert-blue text-white no-underline rounded font-semibold mt-2"
        >
          View Source Code on GitHub
        </a>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">Version</h3>
        <p className="leading-relaxed text-spert-text-secondary">v{APP_VERSION}</p>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">Trademark</h3>
        <p className="leading-relaxed text-spert-text-secondary">
          <TrademarkedName name="SPERT" /> and <TrademarkedName name="Statistical PERT" /> are
          registered trademarks with the United States Patent and Trademark Office.
        </p>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">License</h3>
        <p className="leading-relaxed text-spert-text-secondary">
          This software is licensed under the GNU General Public License v3.0 (GPL-3.0).
          You are free to use, modify, and distribute this software under the terms of the
          GPL-3.0 license.
        </p>
      </section>

      <section className="mb-8">
        <h3 className="text-xl mb-3 text-spert-blue">No Warranty Disclaimer</h3>
        <p className="leading-relaxed text-spert-text-secondary">
          THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW.
          EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES
          PROVIDE THE PROGRAM &quot;AS IS&quot; WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED
          OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
          AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND
          PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU
          ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.
        </p>
      </section>
    </div>
  )
}
