# Koordinační předání bootstrapu

27.10 root `trees-bootstrap-01a16b37` zachovává veškerý vlastní WIP a jednou vytvořený BMAD snapshot. Jen zužuje rezervaci rendereru z celého `_bmad/render/bmad-build/` na skutečný prefix `_bmad/render/bmad-build/strahovcrazyshow-terrain-20261025-56e507fae860/`, aby mohl nezávislý autorizovaný úkol používat svůj jiný prefix. Stávající renderer se znovu nespouští. Reclaim se stejným ownerem a adopt-dirty navazuje výhradně na vlastní práci.
