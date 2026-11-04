"use client";

import { createContext, useContext } from "react";

// In the CRM this view shows what the client sees but is read only: the buttons are the client's own decisions, so a recruiter
// cannot press them from here.
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
